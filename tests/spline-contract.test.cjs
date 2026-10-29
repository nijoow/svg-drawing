const test = require('node:test')
const assert = require('node:assert/strict')
const { bezierCommand } = require('../src/utils/getInformationFromSplinePaths.ts')
const { convertSplineToPath } = require('../src/utils/pathEditing.ts')
const { drawingToPathData, createDocument, serializeDocument, parseDocument } = require('../src/editor/document.ts')

const coordinates = (path) => (path.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number)
const close = (actual, expected) => {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-8, `${value} != ${expected[i]}`))
}

test('pencil preview, saved paths and editable curves retain the same endpoint and smoothing contract', () => {
  for (const points of [
    [
      [0, 0],
      [10, 10],
      [20, 0],
    ],
    [
      [0, 0],
      [0, 20],
    ],
    [
      [-14.3, 8.9],
      [-14.3, 8.9],
      [2.7, -30.2],
      [5, 0],
    ],
  ]) {
    const vertexs = points.map(([x, y], index) => ({ id: `v${index}`, x, y, type: null }))
    const drawing = {
      id: 'pencil',
      type: 'SPLINE',
      subType: null,
      vertexs,
      width: 40,
      height: 60,
      center: { x: 0, y: 0 },
      rotate: 0,
      fill: 'none',
      stroke: '#000000',
      strokeWidth: 1,
      opacity: 1,
    }
    const original = JSON.stringify(drawing)
    const preview = vertexs
      .map((point, index) => (index ? bezierCommand(point, index, vertexs) : `M ${point.x} ${point.y}`))
      .join(' ')
    const saved = parseDocument(serializeDocument({ ...createDocument(), drawings: [drawing] })).drawings[0]
    close(coordinates(preview), coordinates(drawingToPathData(saved)))
    // Converted paths retain the legacy leading move-to-last command; only their actual contour is compared.
    close(coordinates(drawingToPathData(convertSplineToPath(saved))).slice(2), coordinates(preview))
    assert.equal(JSON.stringify(drawing), original)
  }
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 },
  ]
  assert.equal(bezierCommand(points[1], 1, points), 'C 2,2 14,10 10, 10')
  assert.equal(bezierCommand(points[2], 2, points), 'C 14,10 22,-2 20, 0')
})
