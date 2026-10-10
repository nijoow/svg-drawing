const test = require('node:test')
const assert = require('node:assert/strict')
const { createShape } = require('../src/drawing/creation.ts')
const options = { fill: '#123456', stroke: '#000000', strokeWidth: 1, opacity: 1 }

test('shape creation accepts the zero coordinate and rejects a click or nonfinite input', () => {
  const drawing = createShape('RECTANGLE', { x: 0, y: 0 }, { x: 120, y: 80 }, options)
  assert.equal(drawing.width, 120)
  assert.deepEqual(drawing.center, { x: 60, y: 40 })
  assert.equal(createShape('RECTANGLE', { x: 10, y: 10 }, { x: 10, y: 30 }, options), null)
  assert.equal(createShape('RECTANGLE', { x: NaN, y: 10 }, { x: 20, y: 30 }, options), null)
})

test('ellipse geometry is independent of drag direction and all handles stay inside its bounds', () => {
  const forward = createShape('ELLIPSE', { x: 0, y: 0 }, { x: 120, y: 80 }, options)
  const reverse = createShape('ELLIPSE', { x: 120, y: 80 }, { x: 0, y: 0 }, options)
  const geometry = (drawing) => drawing.vertexs.map(({ id, ...vertex }) => vertex)
  assert.deepEqual(geometry(forward), geometry(reverse))
  for (const vertex of forward.vertexs) {
    for (const key of ['x', 'currentHandlerX', 'nextHandlerX']) assert.ok(vertex[key] >= 0 && vertex[key] <= 120)
    for (const key of ['y', 'currentHandlerY', 'nextHandlerY']) assert.ok(vertex[key] >= 0 && vertex[key] <= 80)
  }
})
