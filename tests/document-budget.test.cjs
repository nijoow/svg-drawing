const assert = require('node:assert/strict')
const test = require('node:test')
const { createDocument, parseDocument, serializeDocument } = require('../src/editor/document.ts')
const { createHistory, applyHistoryAction } = require('../src/editor/history.ts')

const path = (id, count = 2, coordinate = 0) => ({
  id,
  type: 'PATH',
  subType: null,
  vertexs: Array.from({ length: count }, (_, index) => ({
    id: `v${index}`,
    type: index ? 'L' : 'M',
    x: coordinate + (index % 2),
    y: 0,
  })),
  width: 1,
  height: 0,
  center: { x: coordinate + 0.5, y: 0 },
  rotate: 0,
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
})
const document = (drawings = []) => ({ ...createDocument(), id: 'budget-document', drawings })

test('the 1000-drawing boundary is accepted; a rejected addition preserves the previous document and history', () => {
  const initial = createHistory(document())
  const limit = document(Array.from({ length: 1000 }, (_, index) => path(`drawing-${index}`)))
  const accepted = applyHistoryAction(initial, { type: 'change', document: limit })
  assert.equal(accepted.error, null)
  assert.equal(accepted.history.present.drawings.length, 1000)
  assert.equal(parseDocument(serializeDocument(accepted.history.present)).drawings.length, 1000)
  const rejected = applyHistoryAction(accepted.history, {
    type: 'change',
    document: { ...limit, drawings: [...limit.drawings, path('extra')] },
  })
  assert.match(rejected.error, /change was not applied.*too many drawings/)
  assert.equal(rejected.history, accepted.history)
})

test('the 100000-vertex boundary stays saveable and a following stroke is rejected', () => {
  const initial = createHistory(document())
  const limit = document([path('full-path', 100000)])
  const accepted = applyHistoryAction(initial, { type: 'change', document: limit })
  assert.equal(accepted.error, null)
  assert.equal(parseDocument(serializeDocument(accepted.history.present)).drawings[0].vertexs.length, 100000)
  const rejected = applyHistoryAction(accepted.history, {
    type: 'change',
    document: { ...limit, drawings: [...limit.drawings, path('new-stroke')] },
  })
  assert.match(rejected.error, /change was not applied.*too many vertices/)
  assert.equal(rejected.history, accepted.history)
})

test('a transform beyond coordinate limits is previewed, then rolled back at commit without losing redo', () => {
  const imported = parseDocument(serializeDocument(document([path('edge', 2, 9999999)])))
  let state = createHistory(imported)
  state = applyHistoryAction(state, { type: 'change', document: { ...imported, name: 'Next' } }).history
  state = applyHistoryAction(state, { type: 'undo' }).history
  const before = state
  state = applyHistoryAction(state, { type: 'begin' }).history
  const moved = {
    ...imported,
    drawings: imported.drawings.map((drawing) => ({
      ...drawing,
      center: { x: drawing.center.x + 2, y: 0 },
      vertexs: drawing.vertexs.map((vertex) => ({ ...vertex, x: vertex.x + 2 })),
    })),
  }
  const preview = applyHistoryAction(state, { type: 'change', document: moved })
  assert.equal(preview.error, null)
  assert.equal(preview.history.present, moved)
  const committed = applyHistoryAction(preview.history, { type: 'end' })
  assert.match(committed.error, /change was not applied.*outside the supported range/)
  assert.equal(committed.history.present, before.present)
  assert.equal(committed.history.past, before.past)
  assert.equal(committed.history.future, before.future)
  assert.equal(committed.history.transaction, null)
})

test('invalid non-gesture style edits and oversized document bytes never enter history', () => {
  const state = createHistory(document([path('drawing')]))
  const invalidStyle = {
    ...state.present,
    drawings: state.present.drawings.map((drawing) => ({ ...drawing, strokeWidth: -1 })),
  }
  assert.equal(applyHistoryAction(state, { type: 'change', document: invalidStyle }).history, state)
  const large = document([path('large-path', 80000)])
  large.drawings[0].vertexs = large.drawings[0].vertexs.map((vertex) => ({
    ...vertex,
    id: `${vertex.id}-${'x'.repeat(110)}`,
  }))
  const rejected = applyHistoryAction(state, { type: 'change', document: large })
  assert.match(rejected.error, /10 MB/)
  assert.equal(rejected.history, state)
})

test('a rejected replacement leaves even an active editing session untouched', () => {
  let state = createHistory(document([path('drawing')]))
  state = applyHistoryAction(state, { type: 'begin' }).history
  const rejected = applyHistoryAction(state, { type: 'replace', document: { ...state.present, version: 999 } })
  assert.match(rejected.error, /version/)
  assert.equal(rejected.history, state)
})
