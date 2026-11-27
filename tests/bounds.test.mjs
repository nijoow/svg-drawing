import test from 'node:test'
import assert from 'node:assert/strict'
import { pathBounds } from '../src/utils/pathGeometry.ts'
import { resizeDrawing, rotateDrawing } from '../src/utils/transformDrawing.ts'

const drawing = {
  type: 'PATH',
  center: { x: 50, y: 0 },
  width: 100,
  height: 0,
  rotate: 0,
  vertexs: [
    { type: 'M', x: 0, y: 0, nextHandlerX: 0, nextHandlerY: 100 },
    { type: 'C', x: 100, y: 0, currentHandlerX: 100, currentHandlerY: 100 },
  ],
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`)
test('curve bounds include the actual apex at y=75 and exclude excess control hull', () => {
  assert.deepEqual(pathBounds(drawing, drawing.vertexs), { center: { x: 50, y: 37.5 }, width: 100, height: 75 })
  const line = drawing.vertexs.map((v, i) => ({ ...v, type: i ? 'L' : 'M' }))
  assert.deepEqual(pathBounds(drawing, line), { center: drawing.center, width: 100, height: 0 })
})

test('rotated bounds stay in local axes and scale about the updated center', () => {
  const rotated = rotateDrawing(drawing, { x: 100, y: 0 }, { x: 90, y: 30 })
  const bounds = pathBounds(rotated, rotated.vertexs)
  near(bounds.width, 100)
  near(bounds.height, 75)
  near(bounds.center.x, 50 - 0.6 * 37.5)
  near(bounds.center.y, 0.8 * 37.5)
  const resized = resizeDrawing({ ...rotated, ...bounds }, 'R', 8, 6)
  const after = pathBounds(resized, resized.vertexs)
  near(after.width, 120)
  near(after.height, 75)
  near(after.center.x, bounds.center.x)
  near(after.center.y, bounds.center.y)
})
