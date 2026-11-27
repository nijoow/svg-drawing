import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from 'jotai/vanilla'
import { drawingsAtom, gestureAtom, savedDrawingsAtom } from '../src/state/drawing.ts'
import { loadCanvas, saveCanvas } from '../src/state/canvasStorage.ts'

export const path = {
  id: 'p',
  type: 'PATH',
  subType: null,
  width: 10,
  height: 20,
  center: { x: 5, y: 10 },
  rotate: 45,
  fill: '#0088ff',
  stroke: 'transparent',
  strokeWidth: 3,
  opacity: 0.6,
  vertexs: [
    { id: 'a', type: 'M', x: 0, y: 0 },
    { id: 'b', type: 'L', x: 10, y: 20 },
  ],
}

test('only completed edits are saved in order, including deleting the last shape', () => {
  const store = createStore()
  const data = new Map()
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  assert.equal(loadCanvas(storage), null)
  store.sub(savedDrawingsAtom, () => saveCanvas(storage, store.get(savedDrawingsAtom)))
  const items = [{ ...path, id: 'second' }, path]
  store.set(drawingsAtom, items)
  store.set(gestureAtom, 'begin')
  store.set(drawingsAtom, [])
  assert.deepEqual(loadCanvas(storage), items)
  store.set(gestureAtom, 'cancel')
  assert.deepEqual(store.get(drawingsAtom), items)
  store.set(gestureAtom, 'begin')
  store.set(drawingsAtom, [])
  store.set(gestureAtom, 'finish')
  assert.deepEqual(loadCanvas(storage), [])
})

test('unreadable, unsupported and malformed drawings are rejected before use', () => {
  for (const raw of [
    '{',
    '{"version":2,"drawings":[]}',
    ...[[null], [path, path], [{ ...path, fill: 'invalid' }], [{ ...path, vertexs: [] }]].map((drawings) =>
      JSON.stringify({ version: 1, drawings }),
    ),
  ]) {
    assert.throws(() => loadCanvas({ getItem: () => raw }))
  }
})
