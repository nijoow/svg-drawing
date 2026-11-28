import test from 'node:test'
import assert from 'node:assert/strict'
import { splitSegment, nearestParameter } from '../src/utils/insertVertex.ts'
import { pathSegments, pointOnSegment } from '../src/utils/pathGeometry.ts'
import { editableVertices } from '../src/utils/getInformationFromSplinePaths.ts'

const vertices = [
  { id: 'a', type: 'M', x: 0, y: 0, nextHandlerX: -70, nextHandlerY: 90 },
  { id: 'b', type: 'C', x: 100, y: 20, currentHandlerX: 140, currentHandlerY: 100 },
  { id: 'c', type: 'S', x: 190, y: 10, currentHandlerX: 170, currentHandlerY: -70 },
]
const near = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6)
function sameCurve(before, after, cut) {
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    near(
      pointOnSegment(before, t),
      t <= cut ? pointOnSegment(after[0], t / cut) : pointOnSegment(after[1], (t - cut) / (1 - cut)),
    )
  }
}
test('splitting open cubics at the tapped point preserves both halves and the following smooth curve', () => {
  const segments = pathSegments(vertices, false)
  const location = pointOnSegment(segments[0], 0.37)
  const t = nearestParameter(segments[0], location)
  assert.ok(Math.abs(t - 0.37) < 1e-6)
  const split = splitSegment(vertices, false, segments[0], t, 'inserted')
  assert.equal(split.length, 4)
  assert.equal(vertices[2].type, 'S')
  const after = pathSegments(split, false)
  sameCurve(segments[0], after, t)
  for (let i = 0; i <= 20; i++) near(pointOnSegment(segments[1], i / 20), pointOnSegment(after[2], i / 20))
})

test('cyclic first cubics split across the last/first vertex boundary', () => {
  const cycle = vertices.slice(0, 2).map((v) => ({
    ...v,
    type: 'C',
    currentHandlerX: v.x - 20,
    currentHandlerY: v.y - 80,
    nextHandlerX: v.x + 30,
    nextHandlerY: v.y + 40,
  }))
  const original = pathSegments(cycle, false)
  const after = pathSegments(splitSegment(cycle, false, original[0], 0.65, 'added'), false)
  sameCurve(original[0], after, 0.65)
  near(pointOnSegment(after[2], 0.7), pointOnSegment(original[1], 0.7))
})

test('straight open, cyclic and Z closing edges insert an editable vertex without closing open paths', () => {
  for (const [first, closed] of [
    ['M', false],
    ['M', true],
    ['L', true],
  ]) {
    const points = [
      { id: 'a', type: first, x: 0, y: 0 },
      { id: 'b', type: 'L', x: 20, y: 0 },
      { id: 'c', type: 'L', x: 0, y: 20 },
    ]
    const segments = pathSegments(points, closed)
    const segment = first === 'L' ? segments[0] : segments.at(-1)
    const location = pointOnSegment(segment, 0.3)
    const next = splitSegment(points, closed, segment, nearestParameter(segment, location), 'new')
    const index = next.findIndex((v) => v.id === 'new')
    near(next[index], location)
    assert.equal(pathSegments(next, closed).length, segments.length + 1)
    assert.equal(next[0].type, first)
    assert.equal(next[index].type, 'L')
    assert.equal(splitSegment(points, closed, segment, 0, 'duplicate'), points)
  }
})

test('a pencil stroke can be split with the same rendered cubic controls', () => {
  const stroke = { type: 'SPLINE', vertexs: vertices.map((v) => ({ id: v.id, x: v.x, y: v.y, type: null })) }
  const points = editableVertices(stroke)
  const before = pathSegments(points, false)
  const next = splitSegment(points, false, before[1], 0.4, 'new')
  assert.equal(editableVertices({ ...stroke, vertexs: next }), next)
  sameCurve(before[1], pathSegments(next, false).slice(1), 0.4)
})
