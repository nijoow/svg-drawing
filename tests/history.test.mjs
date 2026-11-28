import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from 'jotai/vanilla'
import {
  drawingsAtom,
  gestureAtom,
  historyAtom,
  selectedDrawingIdAtom,
  canUndoAtom,
  canRedoAtom,
  savedDrawingsAtom,
} from '../src/state/drawing.ts'

test('a gesture is one undo step and undo restores a deleted selection', () => {
  const store = createStore()
  const initial = [
    { id: 'a', width: 100 },
    { id: 'b', width: 25 },
  ]
  store.set(savedDrawingsAtom, initial)
  assert.equal(store.get(canUndoAtom), false)
  store.set(selectedDrawingIdAtom, 'a')
  store.set(gestureAtom, 'begin')
  for (const width of [110, 120, 130]) store.set(drawingsAtom, [{ id: 'a', width }, initial[1]])
  store.set(gestureAtom, 'finish')
  store.set(historyAtom, 'undo')
  assert.deepEqual(store.get(drawingsAtom), initial)
  assert.equal(store.get(selectedDrawingIdAtom), 'a')
  assert.equal(store.get(canUndoAtom), false)
  store.set(historyAtom, 'redo')
  assert.equal(store.get(drawingsAtom)[0].width, 130)
  store.set(drawingsAtom, [initial[1]])
  store.set(selectedDrawingIdAtom, null)
  store.set(historyAtom, 'undo')
  assert.equal(store.get(selectedDrawingIdAtom), 'a')
  store.set(drawingsAtom, (items) => [...items].reverse())
  assert.equal(store.get(canRedoAtom), false)
  store.set(historyAtom, 'undo')
  assert.deepEqual(
    store.get(drawingsAtom).map((i) => i.id),
    ['a', 'b'],
  )
})

test('selection survives undo when possible and cancelled gestures preserve redo', () => {
  const store = createStore()
  store.set(drawingsAtom, [{ id: 'a' }])
  store.set(drawingsAtom, [{ id: 'a' }, { id: 'b' }])
  store.set(selectedDrawingIdAtom, 'a')
  store.set(historyAtom, 'undo')
  assert.equal(store.get(selectedDrawingIdAtom), 'a')
  store.set(gestureAtom, 'begin')
  store.set(drawingsAtom, [])
  store.set(gestureAtom, 'cancel')
  store.set(gestureAtom, () => []) // A captured pointer can keep moving after Escape.
  assert.deepEqual(store.get(drawingsAtom), [{ id: 'a' }])
  assert.equal(store.get(canRedoAtom), true)
})
