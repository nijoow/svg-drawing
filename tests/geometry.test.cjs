const test = require('node:test')
const assert = require('node:assert/strict')
const {
  moveDrawingVertex,
  reorderDrawing,
  resizeDrawing,
  rotateDrawing,
  translateDrawing,
} = require('../src/utils/drawingGeometry.ts')
const { getInformationFromVertexs } = require('../src/utils/getInformationFromVertex.ts')
const { getSvgInformationFromPath } = require('../src/utils/getInformationFromSplinePaths.ts')
const { remap } = require('../src/utils/remap.ts')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const Path = require('../src/components/Drawings/Path.tsx').default
const Spline = require('../src/components/Drawings/Spline.tsx').default

const makeDrawing = (extra = {}) => ({
  id: 'shape',
  type: 'PATH',
  subType: null,
  width: 20,
  height: 20,
  center: { x: 10, y: 10 },
  rotate: 0,
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  vertexs: [
    { id: 'a', type: 'M', x: 0, y: 0, currentHandlerX: 0, currentHandlerY: 5, nextHandlerX: 5, nextHandlerY: 0 },
    { id: 'b', type: 'L', x: 20, y: 20 },
  ],
  ...extra,
})
const approximate = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
const finiteDrawing = (drawing) => {
  assert.ok(Number.isFinite(drawing.width) && Number.isFinite(drawing.height))
  assert.ok(Number.isFinite(drawing.center.x) && Number.isFinite(drawing.center.y))
  for (const vertex of drawing.vertexs) {
    for (const value of Object.values(vertex)) if (typeof value === 'number') assert.ok(Number.isFinite(value))
  }
}

test('zero-coordinate control handles participate in translation, rotation and resize without mutating source', () => {
  const drawing = makeDrawing()
  const moved = translateDrawing(drawing, 10, 20)
  assert.equal(moved.vertexs[0].currentHandlerX, 10)
  assert.equal(moved.vertexs[0].nextHandlerY, 20)
  const rotated = rotateDrawing(drawing, 90)
  approximate(rotated.vertexs[0].currentHandlerX, 15)
  approximate(rotated.vertexs[0].currentHandlerY, 0)
  const resized = resizeDrawing(drawing, 'BR', { x: 20, y: 20 }, { x: 30, y: 30 })
  assert.equal(resized.vertexs[0].currentHandlerX, -10)
  assert.equal(resized.vertexs[0].currentHandlerY, 0)
  assert.equal(drawing.vertexs[0].currentHandlerX, 0)
})

test('horizontal and vertical paths can resize without non-finite geometry', () => {
  const vertical = makeDrawing({
    width: 0,
    center: { x: 0, y: 10 },
    vertexs: [
      { id: 'a', type: 'M', x: 0, y: 0 },
      { id: 'b', type: 'L', x: 0, y: 20 },
    ],
  })
  const resizedVertical = resizeDrawing(vertical, 'BR', { x: 0, y: 20 }, { x: 10, y: 30 })
  finiteDrawing(resizedVertical)
  assert.equal(resizedVertical.width, 0)
  assert.equal(resizedVertical.height, 40)
  assert.deepEqual(
    resizedVertical.vertexs.map(({ x, y }) => [x, y]),
    [
      [0, -10],
      [0, 30],
    ],
  )
  const horizontal = makeDrawing({
    height: 0,
    center: { x: 10, y: 0 },
    vertexs: [
      { id: 'a', type: 'M', x: 0, y: 0 },
      { id: 'b', type: 'L', x: 20, y: 0 },
    ],
  })
  finiteDrawing(resizeDrawing(horizontal, 'TL', { x: 0, y: 0 }, { x: -10, y: -10 }))
  assert.equal(remap(5, 5, 5, 0, 10), 5)
})

test('rotated resizing scales in local object axes and keeps document center stable', () => {
  const original = makeDrawing()
  const rotated = rotateDrawing(original, 90)
  const resized = resizeDrawing(rotated, 'R', { x: 10, y: 20 }, { x: 10, y: 30 })
  assert.equal(resized.width, 40)
  assert.equal(resized.height, 20)
  assert.deepEqual(resized.center, original.center)
  approximate(resized.vertexs[0].x, 20)
  approximate(resized.vertexs[0].y, -10)
})

test('vertex edits update local bounds after rotation and move control handles with their anchor', () => {
  const moved = moveDrawingVertex(makeDrawing(), 'a', 'VERTEX', -10, -5)
  assert.equal(moved.width, 30)
  assert.equal(moved.height, 25)
  assert.equal(moved.vertexs[0].nextHandlerY, -5)
  const original = rotateDrawing(makeDrawing(), 90)
  const edited = moveDrawingVertex(original, 'a', 'VERTEX', 0, -10)
  approximate(edited.width, 30)
  approximate(edited.height, 20)
  approximate(edited.center.x, 10)
  approximate(edited.center.y, 5)
})

test('layer order names match their action and boundaries never wrap around', () => {
  const drawings = ['a', 'b', 'c', 'd'].map((id) => makeDrawing({ id }))
  const ids = (items) => items.map(({ id }) => id)
  assert.deepEqual(ids(reorderDrawing(drawings, 'b', 'front')), ['a', 'c', 'd', 'b'])
  assert.deepEqual(ids(reorderDrawing(drawings, 'b', 'back')), ['b', 'a', 'c', 'd'])
  assert.deepEqual(ids(reorderDrawing(drawings, 'b', 'forward')), ['a', 'c', 'b', 'd'])
  assert.deepEqual(ids(reorderDrawing(drawings, 'c', 'backward')), ['a', 'c', 'b', 'd'])
  assert.strictEqual(reorderDrawing(drawings, 'a', 'backward'), drawings)
  assert.strictEqual(reorderDrawing(drawings, 'd', 'forward'), drawings)
  assert.strictEqual(reorderDrawing(drawings, 'missing', 'front'), drawings)
})

test('empty geometry and a large path return finite bounds', () => {
  assert.deepEqual(getInformationFromVertexs([]), { width: 0, height: 0, center: { x: 0, y: 0 } })
  assert.deepEqual(getSvgInformationFromPath([]), { width: 0, height: 0, center: { x: 0, y: 0 } })
  const large = Array.from({ length: 150000 }, (_, index) => ({ x: index, y: 0 }))
  assert.equal(getInformationFromVertexs(large).width, 149999)
})

test('renderers safely skip empty paths and render flat paths with a positive viewport', () => {
  for (const Component of [Path, Spline]) {
    assert.equal(renderToStaticMarkup(React.createElement(Component, { drawing: makeDrawing({ vertexs: [] }) })), '')
    const markup = renderToStaticMarkup(
      React.createElement(Component, {
        drawing: makeDrawing({
          type: Component === Spline ? 'SPLINE' : 'PATH',
          width: 0,
          vertexs: [
            { id: 'a', type: 'M', x: 0, y: 0 },
            { id: 'b', type: 'L', x: 0, y: 20 },
          ],
        }),
      }),
    )
    assert.doesNotMatch(markup, /NaN|Infinity|undefined/)
    const viewBox = markup
      .match(/viewBox="([^"]+)"/)[1]
      .split(' ')
      .map(Number)
    assert.ok(viewBox[2] > 0 && viewBox[3] > 0)
  }
})
