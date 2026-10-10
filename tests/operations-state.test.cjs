const assert = require('node:assert/strict')
const test = require('node:test')
const { snapshot_UNSTABLE } = require('recoil')
const { createDocument } = require('../src/editor/document.ts')
const { createHistory } = require('../src/editor/history.ts')
const {
  editorErrorState,
  editorHistoryAtom,
  drawingsAtom,
  selectedDrawingIdAtom,
  selectedDrawingIdsAtom,
  selectedDrawingState,
  selectedDrawingsState,
} = require('../src/recoil/atoms.ts')

const drawing = (id, extra = {}) => ({
  id,
  type: 'PATH',
  subType: null,
  vertexs: [
    { id: `${id}-a`, type: 'M', x: 0, y: 0 },
    { id: `${id}-b`, type: 'L', x: 20, y: 20 },
  ],
  width: 20,
  height: 20,
  center: { x: 10, y: 10 },
  rotate: 0,
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  ...extra,
})
const state = () =>
  snapshot_UNSTABLE(({ set }) => {
    set(
      editorHistoryAtom,
      createHistory({
        ...createDocument(),
        drawings: [drawing('a'), drawing('b'), drawing('locked', { locked: true })],
      }),
    )
  })
const read = (snapshot, atom) => snapshot.getLoadable(atom).getValue()

test('single-selection compatibility never exposes an arbitrary member of a multiple selection', () => {
  const multiple = state().map(({ set }) => set(selectedDrawingIdsAtom, ['a', 'b']))
  assert.equal(read(multiple, selectedDrawingIdAtom), null)
  assert.equal(read(multiple, selectedDrawingState), null)
  assert.deepEqual(
    read(multiple, selectedDrawingsState).map((item) => item.id),
    ['a', 'b'],
  )
  const single = multiple.map(({ set }) => set(selectedDrawingIdAtom, 'b'))
  assert.deepEqual(read(single, selectedDrawingIdsAtom), ['b'])
  assert.equal(read(single, selectedDrawingState).id, 'b')
  const blocked = single.map(({ set }) => set(selectedDrawingIdAtom, 'locked'))
  assert.deepEqual(read(blocked, selectedDrawingIdsAtom), [])
})

test('legacy drawing edits retain selection on rejection and prune only unavailable IDs on accepted changes', () => {
  const selected = state().map(({ set }) => set(selectedDrawingIdsAtom, ['a', 'b']))
  const original = read(selected, drawingsAtom)
  const rejected = selected.map(({ set }) => set(drawingsAtom, [original[0], original[0]]))
  assert.deepEqual(read(rejected, selectedDrawingIdsAtom), ['a', 'b'])
  assert.deepEqual(read(rejected, drawingsAtom), original)
  assert.ok(read(rejected, editorErrorState))
  const accepted = selected.map(({ set }) =>
    set(
      drawingsAtom,
      original.filter((item) => item.id !== 'a'),
    ),
  )
  assert.deepEqual(read(accepted, selectedDrawingIdsAtom), ['b'])
  assert.equal(read(accepted, selectedDrawingState).id, 'b')
})
