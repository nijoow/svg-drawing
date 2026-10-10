const test = require('node:test')
const assert = require('node:assert/strict')
const { createDocument, parseDocument, serializeDocument } = require('../src/editor/document.ts')
const { applyHistoryAction, createHistory } = require('../src/editor/history.ts')
const { rotateDrawing } = require('../src/utils/drawingGeometry.ts')
const {
  applySelectionMask,
  changeDrawingGeometry,
  groupDrawingIds,
  maskSource,
  removeArtboard,
  reorderSelection,
} = require('../src/editor/panelCommands.ts')

const rectangle = (id, extra = {}) => ({
  id,
  type: 'POLYGON',
  subType: null,
  vertexs: [
    { id: `${id}-a`, type: 'M', x: 0, y: 0 },
    { id: `${id}-b`, type: 'L', x: 20, y: 0 },
    { id: `${id}-c`, type: 'L', x: 20, y: 10 },
    { id: `${id}-d`, type: 'L', x: 0, y: 10 },
  ],
  width: 20,
  height: 10,
  center: { x: 10, y: 5 },
  rotate: 0,
  fill: '#000000',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  ...extra,
})

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

test('numeric transform edits use rotated local axes and leave unedited dimensions stable', () => {
  const source = rotateDrawing(rectangle('shape'), 30)
  const wide = changeDrawingGeometry(source, 'width', 80)
  close(wide.width, 80)
  close(wide.height, 10)
  close(wide.rotate, 30)
  assert.deepEqual(wide.center, source.center)
  const tall = changeDrawingGeometry(wide, 'height', 40)
  close(tall.width, 80)
  close(tall.height, 40)
  const translated = changeDrawingGeometry(tall, 'x', -40)
  close(translated.center.x - translated.width / 2, -40)
  close(translated.center.y, tall.center.y)
  const rotated = changeDrawingGeometry(translated, 'rotate', -90)
  close(rotated.rotate, -90)
  assert.deepEqual(rotated.center, translated.center)
  assert.equal(source.width, 20)
  assert.strictEqual(changeDrawingGeometry(source, 'width', NaN), source)
})

test('raising and lowering a selection preserves stacking order and stops at boundaries', () => {
  const drawings = ['a', 'b', 'c', 'd', 'e'].map((id) => rectangle(id))
  const ids = (items) => items.map(({ id }) => id)
  assert.deepEqual(ids(reorderSelection(drawings, ['b', 'c'], 'up')), ['a', 'd', 'b', 'c', 'e'])
  assert.deepEqual(ids(reorderSelection(drawings, ['b', 'd'], 'down')), ['b', 'a', 'd', 'c', 'e'])
  assert.strictEqual(reorderSelection(drawings, ['e'], 'up'), drawings)
  assert.strictEqual(reorderSelection(drawings, ['a'], 'down'), drawings)
  assert.deepEqual(ids(drawings), ['a', 'b', 'c', 'd', 'e'])
})

test('nested layer groups include descendants without selecting sibling groups', () => {
  const document = {
    ...createDocument(),
    groups: [
      { id: 'root', name: 'Root' },
      { id: 'child', name: 'Child', parentId: 'root' },
      { id: 'other', name: 'Other' },
    ],
    drawings: [
      rectangle('a', { groupId: 'root' }),
      rectangle('b', { groupId: 'child' }),
      rectangle('c', { groupId: 'other' }),
    ],
  }
  assert.deepEqual(groupDrawingIds(document, 'root'), ['a', 'b'])
  assert.deepEqual(groupDrawingIds(document, 'child'), ['b'])
  assert.deepEqual(groupDrawingIds(document, 'missing'), [])
})

test('clipping consumes only the top closed shape, preserves contours and undoes atomically', () => {
  const top = rectangle('mask', { subpaths: [rectangle('hole').vertexs] })
  const document = { ...createDocument(), drawings: [rectangle('target'), rectangle('untouched'), top] }
  const masked = applySelectionMask(document, ['target', 'mask'])
  assert.deepEqual(
    masked.drawings.map(({ id }) => id),
    ['target', 'untouched'],
  )
  assert.deepEqual(masked.drawings[0].clip.vertexs, top.vertexs)
  assert.deepEqual(masked.drawings[0].clip.subpaths, top.subpaths)
  assert.notStrictEqual(masked.drawings[0].clip.vertexs[0], top.vertexs[0])
  assert.strictEqual(masked.drawings[1], document.drawings[1])
  assert.equal(document.drawings[0].clip, undefined)
  assert.deepEqual(parseDocument(serializeDocument(masked)).drawings[0].clip, masked.drawings[0].clip)
  const edited = applyHistoryAction(createHistory(document), { type: 'change', document: masked })
  assert.equal(edited.error, null)
  assert.equal(edited.history.past.length, 1)
  assert.deepEqual(applyHistoryAction(edited.history, { type: 'undo' }).history.present, document)
})

test('masking rejects an open or unavailable top shape and requires another object', () => {
  const target = rectangle('target')
  assert.equal(maskSource([target]), undefined)
  assert.equal(maskSource([target, rectangle('top', { type: 'PATH' })]), undefined)
  assert.equal(maskSource([target, rectangle('top', { locked: true })]), undefined)
  const document = { ...createDocument(), drawings: [target, rectangle('top', { type: 'PATH' })] }
  assert.strictEqual(applySelectionMask(document, ['target', 'top']), document)
})

test('consuming a mask source removes its now-empty group without disturbing target groups', () => {
  const document = {
    ...createDocument(),
    groups: [
      { id: 'target-group', name: 'Target group' },
      { id: 'mask-group', name: 'Mask group' },
    ],
    drawings: [rectangle('target', { groupId: 'target-group' }), rectangle('mask', { groupId: 'mask-group' })],
  }
  const masked = applySelectionMask(document, ['target', 'mask'])
  assert.deepEqual(masked.groups, [document.groups[0]])
  assert.equal(masked.drawings[0].groupId, 'target-group')
  assert.doesNotThrow(() => serializeDocument(masked))
})

test('removing an artboard detaches its objects and preserves their content and placement', () => {
  const document = {
    ...createDocument(),
    artboards: [{ id: 'board', name: 'Board', x: 0, y: 0, width: 800, height: 600 }],
    drawings: [rectangle('inside', { artboardId: 'board' }), rectangle('outside')],
  }
  const next = removeArtboard(document, 'board')
  assert.deepEqual(next.artboards, [])
  assert.equal(next.drawings.length, 2)
  assert.equal(next.drawings[0].artboardId, undefined)
  assert.deepEqual(next.drawings[0].vertexs, document.drawings[0].vertexs)
  assert.deepEqual(next.drawings[0].center, document.drawings[0].center)
  assert.strictEqual(next.drawings[1], document.drawings[1])
  assert.equal(document.drawings[0].artboardId, 'board')
  assert.doesNotThrow(() => serializeDocument(next))
})
