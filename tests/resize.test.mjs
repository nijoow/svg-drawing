import test from 'node:test'
import assert from 'node:assert/strict'
import { resizeDrawing, rotateDrawing } from '../src/utils/transformDrawing.ts'

const box = {
  width: 160,
  height: 120,
  center: { x: 300, y: 250 },
  rotate: 0,
  vertexs: [
    { x: 220, y: 190 },
    { x: 380, y: 310 },
  ],
}
test('two consecutive drags can collapse and expand either axis without moving the center', () => {
  const thin = resizeDrawing(box, 'R', -80, 0)
  const wide = resizeDrawing(thin, 'R', 55, 0)
  assert.equal(thin.width, 1)
  assert.equal(wide.width, 111)
  assert.equal(wide.vertexs[1].x - wide.vertexs[0].x, wide.width)
  assert.deepEqual(wide.center, box.center)
  const short = resizeDrawing(box, 'B', 0, -60)
  assert.equal(resizeDrawing(short, 'B', 0, 55).height, 111)
})

test('horizontal and vertical lines keep their flat axis through rotation and resizing', () => {
  for (const vertical of [true, false]) {
    const line = {
      ...box,
      width: vertical ? 0 : 160,
      height: vertical ? 120 : 0,
      vertexs: box.vertexs.map((v) => ({ x: vertical ? 300 : v.x, y: vertical ? v.y : 250 })),
    }
    const turned = rotateDrawing(line, { x: 350, y: 250 }, { x: 300, y: 300 })
    const result = resizeDrawing(turned, 'BR', -27, 27)
    assert.equal(result.rotate, 90)
    assert.equal(vertical ? result.width : result.height, 0)
    assert.ok((vertical ? result.height : result.width) > (vertical ? line.height : line.width))
    for (const v of result.vertexs) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y))
  }
})
