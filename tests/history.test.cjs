const assert = require('node:assert/strict')
const test = require('node:test')
const { createDocument } = require('../src/editor/document.ts')
const { createHistory, historyReducer, HISTORY_LIMIT } = require('../src/editor/history.ts')

const document = () => ({ ...createDocument(), id: 'history-document' })
const rename = (state, name) => historyReducer(state, { type: 'change', document: { ...state.present, name } })

test('each completed edit can be undone and redone; branching clears redo', () => {
  let state = createHistory(document())
  const initial = state.present
  state = rename(state, 'First')
  state = rename(state, 'Second')
  state = historyReducer(state, { type: 'undo' })
  assert.equal(state.present.name, 'First')
  state = historyReducer(state, { type: 'undo' })
  assert.equal(state.present, initial)
  state = historyReducer(state, { type: 'redo' })
  assert.equal(state.present.name, 'First')
  state = rename(state, 'Branch')
  assert.equal(state.future.length, 0)
  assert.equal(historyReducer(state, { type: 'redo' }), state)
})

test('hundreds of gesture updates create exactly one undo entry', () => {
  let state = createHistory(document())
  const initial = state.present
  state = historyReducer(state, { type: 'begin' })
  for (let index = 0; index < 300; index++) state = rename(state, `Drag ${index}`)
  assert.equal(state.past.length, 0)
  state = historyReducer(state, { type: 'end' })
  assert.equal(state.past.length, 1)
  assert.equal(state.transaction, null)
  state = historyReducer(state, { type: 'undo' })
  assert.equal(state.present, initial)
  state = historyReducer(state, { type: 'redo' })
  assert.equal(state.present.name, 'Drag 299')
})

test('no-op edits and gestures returning to their origin preserve undo/redo', () => {
  let state = createHistory(document())
  state = rename(state, 'First')
  state = historyReducer(state, { type: 'undo' })
  const before = state
  assert.equal(rename(state, state.present.name), state)
  state = historyReducer(state, { type: 'begin' })
  state = historyReducer(state, { type: 'begin' })
  state = rename(state, 'Temporary')
  state = historyReducer(state, { type: 'change', document: { ...before.present } })
  state = historyReducer(state, { type: 'end' })
  assert.equal(state.present, before.present)
  assert.equal(state.past, before.past)
  assert.equal(state.future, before.future)
  assert.equal(historyReducer(state, { type: 'end' }), state)
})

test('canceled gestures restore the pre-gesture document and preserve redo', () => {
  let state = rename(createHistory(document()), 'Next')
  state = historyReducer(state, { type: 'undo' })
  const before = state
  state = historyReducer(state, { type: 'begin' })
  state = rename(state, 'Temporary')
  state = historyReducer(state, { type: 'cancel' })
  assert.equal(state.present, before.present)
  assert.equal(state.future, before.future)
  assert.equal(state.past, before.past)
  assert.equal(state.transaction, null)
})

test('undo during a gesture resolves it without stale history', () => {
  let state = rename(createHistory(document()), 'First')
  state = historyReducer(state, { type: 'begin' })
  state = rename(state, 'Dragging')
  state = historyReducer(state, { type: 'undo' })
  assert.equal(state.present.name, 'First')
  assert.equal(state.transaction, null)
  state = historyReducer(state, { type: 'redo' })
  assert.equal(state.present.name, 'Dragging')
})

test('replacing a document resets history and an active gesture', () => {
  let state = rename(createHistory(document()), 'Edited')
  state = historyReducer(state, { type: 'begin' })
  const next = document()
  state = historyReducer(state, { type: 'replace', document: next })
  assert.deepEqual(state, { past: [], present: next, future: [], transaction: null })
})

test('history memory is bounded and retained entries stay undoable', () => {
  let state = createHistory(document())
  for (let index = 0; index < HISTORY_LIMIT + 10; index++) state = rename(state, `Edit ${index}`)
  assert.equal(state.past.length, HISTORY_LIMIT)
  for (let index = 0; index < HISTORY_LIMIT; index++) state = historyReducer(state, { type: 'undo' })
  assert.equal(state.present.name, 'Edit 9')
  assert.equal(state.past.length, 0)
  assert.equal(state.future.length, HISTORY_LIMIT)
})
