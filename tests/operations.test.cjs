const assert = require('node:assert/strict')
const test = require('node:test')
const { createDocument, parseDocument, getDrawingBounds } = require('../src/editor/document.ts')
const { applyHistoryAction, createHistory } = require('../src/editor/history.ts')
const {
  expandSelection,
  selectionForDrawing,
  groupSelection,
  ungroupSelection,
  deleteSelection,
  copySelection,
  pasteSelection,
  duplicateSelection,
  alignSelection,
  distributeSelection,
  patchSelection,
  normalizeGroupStacking,
  reorderDocumentSelection,
} = require('../src/editor/operations.ts')
const { screenToDocument, documentToScreen, zoomViewportAt, fitViewportToBounds } = require('../src/editor/viewport.ts')

const drawing = (id, x = 0, y = 0, width = 20, height = 20, extra = {}) => ({
  id,
  type: 'POLYGON',
  subType: null,
  vertexs: [
    { id: `${id}-1`, type: 'M', x, y },
    { id: `${id}-2`, type: 'L', x: x + width, y },
    { id: `${id}-3`, type: 'L', x: x + width, y: y + height },
    { id: `${id}-4`, type: 'L', x, y: y + height },
  ],
  width,
  height,
  center: { x: x + width / 2, y: y + height / 2 },
  rotate: 0,
  fill: '#000000',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  ...extra,
})
const document = (drawings, groups = []) => ({ ...createDocument(), drawings, groups })
const ids = () => {
  let index = 0
  return () => `fresh-${++index}`
}

test('nested group selection resolves in stacking order and excludes hidden/locked objects', () => {
  const doc = document(
    [
      drawing('a', 0, 0, 20, 20, { groupId: 'inner' }),
      drawing('b', 0, 0, 20, 20, { groupId: 'outer' }),
      drawing('locked', 0, 0, 20, 20, { groupId: 'inner', locked: true }),
      drawing('hidden', 0, 0, 20, 20, { groupId: 'outer', hidden: true }),
      drawing('other'),
    ],
    [
      { id: 'outer', name: 'Outer' },
      { id: 'inner', name: 'Inner', parentId: 'outer' },
    ],
  )
  assert.deepEqual(expandSelection(doc, ['outer', 'missing', 'a']), ['a', 'b'])
  assert.deepEqual(selectionForDrawing(doc, 'a'), ['a', 'b'])
  assert.deepEqual(selectionForDrawing(doc, 'a', true), ['a'])
  assert.deepEqual(selectionForDrawing(doc, 'locked'), [])
})

test('grouping preserves existing nested groups and ungrouping removes just the outer level', () => {
  const doc = document(
    [drawing('a', 0, 0, 20, 20, { groupId: 'old' }), drawing('b', 30, 0, 20, 20, { groupId: 'old' }), drawing('c')],
    [{ id: 'old', name: 'Old' }],
  )
  const grouped = groupSelection(doc, ['old', 'c'], () => 'new')
  assert.equal(grouped.document.groups.find((group) => group.id === 'old').parentId, 'new')
  assert.equal(grouped.document.drawings[0].groupId, 'old')
  assert.equal(grouped.document.drawings[2].groupId, 'new')
  assert.equal(groupSelection(grouped.document, grouped.selection).document, grouped.document)
  const ungrouped = ungroupSelection(grouped.document, ['new'])
  assert.equal(ungrouped.document.groups.length, 1)
  assert.equal(ungrouped.document.groups[0].id, 'old')
  assert.equal(ungrouped.document.groups[0].parentId, undefined)
  assert.equal(ungrouped.document.drawings[2].groupId, undefined)
  assert.deepEqual(ungrouped.selection, ['a', 'b', 'c'])
  assert.equal(doc.groups[0].parentId, undefined)
  parseDocument(JSON.stringify(ungrouped.document))
})

test('deleting selected group contents prunes orphan ancestors while protecting locked content', () => {
  const doc = document(
    [
      drawing('a', 0, 0, 20, 20, { groupId: 'inner' }),
      drawing('locked', 0, 0, 20, 20, { groupId: 'outer', locked: true }),
    ],
    [
      { id: 'outer', name: 'Outer' },
      { id: 'inner', name: 'Inner', parentId: 'outer' },
    ],
  )
  const result = deleteSelection(doc, ['outer'])
  assert.deepEqual(
    result.document.drawings.map((item) => item.id),
    ['locked'],
  )
  assert.deepEqual(
    result.document.groups.map((group) => group.id),
    ['outer'],
  )
  assert.deepEqual(result.selection, [])
  const empty = deleteSelection(document([drawing('a', 0, 0, 20, 20, { groupId: 'g' })], [{ id: 'g', name: 'G' }]), [
    'g',
  ])
  assert.equal(empty.document.groups.length, 0)
})

test('grouping a subset of siblings creates a nested group at their highest selected slot', () => {
  const doc = document(
    ['a', 'b', 'c', 'd'].map((id) => drawing(id, 0, 0, 20, 20, { groupId: 'parent' })),
    [{ id: 'parent', name: 'Parent' }],
  )
  const grouped = groupSelection(doc, ['a', 'c'], () => 'child').document
  assert.equal(grouped.groups.find((group) => group.id === 'child').parentId, 'parent')
  assert.deepEqual(
    grouped.drawings.map((item) => item.id),
    ['b', 'a', 'c', 'd'],
  )
  assert.deepEqual(
    grouped.drawings.filter((item) => item.groupId === 'child').map((item) => item.id),
    ['a', 'c'],
  )
  assert.deepEqual(
    doc.drawings.map((item) => item.id),
    ['a', 'b', 'c', 'd'],
  )
  parseDocument(JSON.stringify(grouped))
})

test('nonadjacent selection becomes one layer block while retaining selection order', () => {
  const doc = document(['a', 'b', 'c', 'd'].map((id) => drawing(id)))
  const grouped = groupSelection(doc, ['c', 'a'], () => 'group').document
  assert.deepEqual(
    grouped.drawings.map((item) => item.id),
    ['b', 'a', 'c', 'd'],
  )
  assert.equal(normalizeGroupStacking(grouped), grouped)
  parseDocument(JSON.stringify(grouped))
})

test('grouping cannot extract accessible siblings across a protected ancestor boundary', () => {
  for (const flag of ['hidden', 'locked']) {
    const doc = document(
      [
        drawing('a', 0, 0, 20, 20, { groupId: 'parent' }),
        drawing('b', 0, 0, 20, 20, { groupId: 'parent' }),
        drawing('protected', 0, 0, 20, 20, { groupId: 'parent', [flag]: true }),
        drawing('other'),
      ],
      [{ id: 'parent', name: 'Parent' }],
    )
    assert.equal(groupSelection(doc, ['parent', 'other'], () => 'new').document, doc)
    const nested = groupSelection(doc, ['a', 'b'], () => 'child').document
    assert.equal(nested.groups.find((group) => group.id === 'child').parentId, 'parent')
    assert.equal(
      nested.drawings.find((item) => item.id === 'protected'),
      doc.drawings[2],
    )
    parseDocument(JSON.stringify(nested))
  }
})

test('grouping across editable branches keeps every remaining ancestor contiguous', () => {
  const doc = document(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
      drawing(id, 0, 0, 20, 20, { groupId: index < 3 ? 'left' : 'right' }),
    ),
    [
      { id: 'left', name: 'Left' },
      { id: 'right', name: 'Right' },
    ],
  )
  const grouped = groupSelection(doc, ['b', 'e'], () => 'new').document
  assert.deepEqual(
    grouped.drawings.map((item) => item.id),
    ['a', 'c', 'b', 'e', 'd', 'f'],
  )
  assert.equal(normalizeGroupStacking(grouped), grouped)
  assert.deepEqual(
    grouped.drawings.filter((item) => item.groupId === 'new').map((item) => item.id),
    ['b', 'e'],
  )
  parseDocument(JSON.stringify(grouped))
})

test('grouping an existing child group with a sibling retains their shared ancestor', () => {
  const doc = document(
    [
      drawing('a', 0, 0, 20, 20, { groupId: 'inner' }),
      drawing('b', 0, 0, 20, 20, { groupId: 'inner' }),
      drawing('c', 0, 0, 20, 20, { groupId: 'outer' }),
      drawing('d', 0, 0, 20, 20, { groupId: 'outer' }),
    ],
    [
      { id: 'outer', name: 'Outer' },
      { id: 'inner', name: 'Inner', parentId: 'outer' },
    ],
  )
  const grouped = groupSelection(doc, ['inner', 'c'], () => 'middle').document
  assert.equal(grouped.groups.find((group) => group.id === 'middle').parentId, 'outer')
  assert.equal(grouped.groups.find((group) => group.id === 'inner').parentId, 'middle')
  assert.deepEqual(selectionForDrawing(grouped, 'a'), ['a', 'b', 'c', 'd'])
  parseDocument(JSON.stringify(grouped))
})

test('raising a full group crosses the next sibling group as one contiguous unit', () => {
  const doc = document(
    [
      drawing('a1', 0, 0, 20, 20, { groupId: 'a' }),
      drawing('a2', 0, 0, 20, 20, { groupId: 'a' }),
      drawing('b1', 0, 0, 20, 20, { groupId: 'b' }),
      drawing('b2', 0, 0, 20, 20, { groupId: 'b' }),
      drawing('top'),
    ],
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  )
  const raised = reorderDocumentSelection(doc, ['a'], 'up')
  assert.deepEqual(
    raised.drawings.map((item) => item.id),
    ['b1', 'b2', 'a1', 'a2', 'top'],
  )
  assert.equal(normalizeGroupStacking(raised), raised)
  assert.equal(raised.groups, doc.groups)
  assert.deepEqual(reorderDocumentSelection(raised, ['a'], 'down').drawings, doc.drawings)
  assert.deepEqual(
    reorderDocumentSelection(doc, ['a'], 'front').drawings.map((item) => item.id),
    ['b1', 'b2', 'top', 'a1', 'a2'],
  )
  assert.equal(reorderDocumentSelection(doc, ['a'], 'back'), doc)
  parseDocument(JSON.stringify(raised))
})

test('a partial group selection moves only among siblings and cannot escape its parent', () => {
  const doc = document(
    [
      drawing('below'),
      ...['a', 'b', 'c'].map((id) => drawing(id, 0, 0, 20, 20, { groupId: 'group' })),
      drawing('above'),
    ],
    [{ id: 'group', name: 'Group' }],
  )
  const raised = reorderDocumentSelection(doc, ['a'], 'front')
  assert.deepEqual(
    raised.drawings.map((item) => item.id),
    ['below', 'b', 'c', 'a', 'above'],
  )
  assert.equal(reorderDocumentSelection(raised, ['a'], 'up'), raised)
  assert.equal(reorderDocumentSelection(raised, ['a'], 'front'), raised)
  const lowered = reorderDocumentSelection(raised, ['a'], 'back')
  assert.deepEqual(lowered.drawings, doc.drawings)
  assert.equal(normalizeGroupStacking(raised), raised)
})

test('nested group reorder selects the highest complete group but keeps partial branches inside their ancestor', () => {
  const doc = document(
    [
      drawing('a', 0, 0, 20, 20, { groupId: 'inner' }),
      drawing('b', 0, 0, 20, 20, { groupId: 'inner' }),
      drawing('c', 0, 0, 20, 20, { groupId: 'outer' }),
      drawing('outside'),
    ],
    [
      { id: 'outer', name: 'Outer' },
      { id: 'inner', name: 'Inner', parentId: 'outer' },
    ],
  )
  const inner = reorderDocumentSelection(doc, ['inner'], 'up')
  assert.deepEqual(
    inner.drawings.map((item) => item.id),
    ['c', 'a', 'b', 'outside'],
  )
  assert.equal(reorderDocumentSelection(inner, ['inner'], 'up'), inner)
  const outer = reorderDocumentSelection(doc, ['outer'], 'up')
  assert.deepEqual(
    outer.drawings.map((item) => item.id),
    ['outside', 'a', 'b', 'c'],
  )
  assert.equal(normalizeGroupStacking(outer), outer)
  const member = reorderDocumentSelection(doc, ['a'], 'front')
  assert.deepEqual(
    member.drawings.map((item) => item.id),
    ['b', 'a', 'c', 'outside'],
  )
  assert.equal(normalizeGroupStacking(member), member)
})

test('reordering multiple sibling units preserves selected order and protected groups remain partial', () => {
  const doc = document(
    [
      drawing('a1', 0, 0, 20, 20, { groupId: 'a' }),
      drawing('a2', 0, 0, 20, 20, { groupId: 'a' }),
      drawing('gap'),
      drawing('selected'),
      drawing('top'),
    ],
    [{ id: 'a', name: 'A' }],
  )
  const moved = reorderDocumentSelection(doc, ['a', 'selected'], 'up')
  assert.deepEqual(
    moved.drawings.map((item) => item.id),
    ['gap', 'a1', 'a2', 'top', 'selected'],
  )
  assert.equal(normalizeGroupStacking(moved), moved)
  for (const flag of ['locked', 'hidden']) {
    const protectedDoc = document(
      [
        drawing('a', 0, 0, 20, 20, { groupId: 'g' }),
        drawing('protected', 0, 0, 20, 20, { groupId: 'g', [flag]: true }),
        drawing('other'),
      ],
      [{ id: 'g', name: 'Group' }],
    )
    const result = reorderDocumentSelection(protectedDoc, ['g'], 'front')
    assert.deepEqual(
      result.drawings.map((item) => item.id),
      ['protected', 'a', 'other'],
    )
    assert.equal(result.drawings[0], protectedDoc.drawings[1])
    assert.equal(reorderDocumentSelection(protectedDoc, ['protected'], 'front'), protectedDoc)
    assert.equal(normalizeGroupStacking(result), result)
  }
})

test('hierarchical stacking changes form one reversible document edit', () => {
  const doc = document(
    [drawing('a', 0, 0, 20, 20, { groupId: 'g' }), drawing('b', 0, 0, 20, 20, { groupId: 'g' }), drawing('other')],
    [{ id: 'g', name: 'Group' }],
  )
  const moved = reorderDocumentSelection(doc, ['g'], 'front')
  const result = applyHistoryAction(createHistory(doc), { type: 'change', document: moved })
  assert.equal(result.error, null)
  assert.equal(result.history.past.length, 1)
  assert.equal(applyHistoryAction(result.history, { type: 'undo' }).history.present, doc)
  assert.deepEqual(reorderDocumentSelection(doc, ['missing'], 'up'), doc)
})

test('clipboard is a deep snapshot and paste remaps groups, all path IDs, masks and positions', () => {
  const shape = drawing('a', 10, 20, 20, 20, {
    groupId: 'g',
    gradient: {
      type: 'linear',
      angle: 30,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    },
    clip: { vertexs: drawing('clip').vertexs },
    subpaths: [drawing('inner', 12, 22, 4, 4).vertexs],
  })
  const source = document([shape], [{ id: 'g', name: 'Group' }])
  const clipboard = copySelection(source, ['g'])
  shape.gradient.angle = 90
  assert.equal(clipboard.drawings[0].gradient.angle, 30)
  const destination = document([])
  const result = pasteSelection(destination, clipboard, 24, ids())
  const pasted = result.document.drawings[0]
  assert.notEqual(pasted.id, shape.id)
  assert.notEqual(pasted.groupId, 'g')
  assert.equal(result.document.groups[0].id, pasted.groupId)
  assert.equal(pasted.center.x, 44)
  assert.equal(pasted.center.y, 54)
  assert.equal(pasted.clip.vertexs[0].x, 24)
  assert.equal(pasted.subpaths[0][0].x, 36)
  assert.notEqual(pasted.vertexs[0].id, shape.vertexs[0].id)
  assert.notEqual(pasted.clip.vertexs[0].id, shape.clip.vertexs[0].id)
  assert.notEqual(pasted.subpaths[0][0].id, shape.subpaths[0][0].id)
  assert.deepEqual(result.selection, [pasted.id])
  assert.equal(clipboard.drawings[0].center.x, 20)
  parseDocument(JSON.stringify(result.document))
})

test('duplicate keeps the original and detached clipboard groups never refer to the source document', () => {
  const source = document(
    [drawing('a', 0, 0, 20, 20, { groupId: 'inner', artboardId: 'board' })],
    [
      { id: 'outer', name: 'Outer' },
      { id: 'inner', name: 'Inner', parentId: 'outer' },
    ],
  )
  source.artboards = [{ id: 'board', name: 'Board', x: 0, y: 0, width: 500, height: 500 }]
  const duplicate = duplicateSelection(source, ['a'], ids())
  assert.equal(duplicate.document.drawings.length, 2)
  assert.equal(duplicate.document.drawings[0], source.drawings[0])
  assert.equal(duplicate.document.drawings[1].artboardId, 'board')
  const pasted = pasteSelection(document([]), copySelection(source, ['a']), 24, ids())
  assert.equal(pasted.document.drawings[0].artboardId, undefined)
  const inner = pasted.document.groups.find((group) => group.name === 'Inner')
  assert.equal(inner.parentId, pasted.document.groups.find((group) => group.name === 'Outer').id)
  parseDocument(JSON.stringify(pasted.document))
})

test('alignment moves complete groups as units without changing their internal spacing', () => {
  const doc = document(
    [
      drawing('a', 20, 30, 20, 20, { groupId: 'g' }),
      drawing('b', 70, 40, 20, 20, { groupId: 'g' }),
      drawing('c', 150, 150),
    ],
    [{ id: 'g', name: 'G' }],
  )
  const aligned = alignSelection(doc, ['g', 'c'], 'right')
  assert.equal(getDrawingBounds(aligned.drawings[1]).maxX, getDrawingBounds(aligned.drawings[2]).maxX)
  assert.equal(aligned.drawings[1].center.x - aligned.drawings[0].center.x, 50)
  assert.equal(aligned.drawings[1].center.y - aligned.drawings[0].center.y, 10)
  assert.equal(aligned.drawings[2].center.x, doc.drawings[2].center.x)
  assert.equal(alignSelection(doc, ['g'], 'right'), doc)
})

test('distribution equalizes gaps for differently sized objects and preserves the outer edges', () => {
  const doc = document([drawing('a', 0, 0, 10, 10), drawing('b', 20, 0, 30, 10), drawing('c', 100, 0, 20, 10)])
  const aligned = distributeSelection(doc, ['a', 'b', 'c'], 'horizontal')
  const bounds = aligned.drawings.map(getDrawingBounds)
  assert.equal(bounds[1].minX - bounds[0].maxX, bounds[2].minX - bounds[1].maxX)
  assert.equal(bounds[0].minX, 0)
  assert.equal(bounds[2].maxX, 120)
  assert.equal(aligned.drawings[1].center.y, 5)
})

test('a multi-object style change is one validated undo step and never changes locked objects', () => {
  const doc = document([drawing('a'), drawing('b'), drawing('locked', 0, 0, 20, 20, { locked: true })])
  const edited = patchSelection(doc, ['a', 'b', 'locked'], { fill: '#ff0000', id: 'replacement' })
  const initial = createHistory(doc)
  const change = applyHistoryAction(initial, { type: 'change', document: edited })
  assert.equal(change.error, null)
  assert.equal(change.history.past.length, 1)
  assert.equal(edited.drawings[0].id, 'a')
  assert.equal(edited.drawings[1].fill, '#ff0000')
  assert.equal(edited.drawings[2].fill, '#000000')
  assert.equal(applyHistoryAction(change.history, { type: 'undo' }).history.present, doc)
  const rejected = applyHistoryAction(change.history, {
    type: 'change',
    document: patchSelection(edited, ['a'], { opacity: Infinity }),
  })
  assert.ok(rejected.error)
  assert.equal(rejected.history, change.history)
})

test('zoom keeps the document point under the pointer fixed through pan and zoom', () => {
  const viewport = { x: 123, y: -80, zoom: 0.5 }
  const point = { x: 500, y: 200 }
  const local = screenToDocument(viewport, point)
  assert.deepEqual(documentToScreen(viewport, local), point)
  const zoomed = zoomViewportAt(viewport, 3, point)
  assert.deepEqual(screenToDocument(zoomed, point), local)
  assert.equal(zoomViewportAt(viewport, 100, point).zoom, 16)
  assert.equal(zoomViewportAt(viewport, 0, point).zoom, 0.05)
})

test('fit view centers negative-coordinate documents and handles flat bounds', () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50, width: 200, height: 100 }
  const fitted = fitViewportToBounds(bounds, 1000, 600)
  assert.deepEqual(documentToScreen(fitted, { x: 0, y: 0 }), { x: 500, y: 300 })
  assert.ok(fitted.zoom * 200 <= 840)
  const flat = fitViewportToBounds({ ...bounds, width: 0, height: 0 }, 20, 20)
  assert.ok(Number.isFinite(flat.zoom) && Number.isFinite(flat.x) && Number.isFinite(flat.y))
})
