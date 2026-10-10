const test = require('node:test')
const assert = require('node:assert/strict')
const {
  cubicPoint,
  getSelectionBounds,
  recalculateDrawingBounds,
  resizeDrawing,
  resizeDrawings,
  rotateDrawingAround,
  translateDrawing,
} = require('../src/utils/drawingGeometry.ts')
const {
  convertSplineToPath,
  deleteDrawingVertex,
  setDrawingVertexKind,
  simplifyDrawing,
  simplifyVertices,
  splitDrawingSegment,
  straightenDrawingSegment,
  toggleDrawingClosed,
} = require('../src/utils/pathEditing.ts')
const { snapPoint, snapTranslation } = require('../src/utils/snapping.ts')
const { createDocument, parseDocument, serializeDocument } = require('../src/editor/document.ts')

const drawing = (extra = {}) => ({
  id: 'drawing-a',
  type: 'PATH',
  subType: null,
  width: 100,
  height: 75,
  center: { x: 50, y: 37.5 },
  rotate: 0,
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  vertexs: [
    { id: 'a', type: 'M', x: 0, y: 0, nextHandlerX: 0, nextHandlerY: 100 },
    { id: 'b', type: 'C', x: 100, y: 0, currentHandlerX: 100, currentHandlerY: 100 },
  ],
  ...extra,
})
const rectangle = (id, x, y, width, height) =>
  drawing({
    id,
    type: 'POLYGON',
    width,
    height,
    center: { x: x + width / 2, y: y + height / 2 },
    vertexs: [
      { id: 'a', type: 'L', x, y },
      { id: 'b', type: 'L', x: x + width, y },
      { id: 'c', type: 'L', x: x + width, y: y + height },
      { id: 'd', type: 'L', x, y: y + height },
    ],
  })
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
const pointApprox = (a, b) => {
  approx(a.x, b.x)
  approx(a.y, b.y)
}
const segment = (start, end, t) =>
  cubicPoint(
    start,
    { x: start.nextHandlerX ?? start.x, y: start.nextHandlerY ?? start.y },
    { x: end.currentHandlerX ?? end.x, y: end.currentHandlerY ?? end.y },
    end,
    t,
  )
const roundtrip = (value) => {
  const doc = createDocument('Geometry')
  doc.drawings = [value]
  assert.equal(parseDocument(serializeDocument(doc)).drawings[0].id, value.id)
}

test('de Casteljau splitting preserves every sampled point on the original curve and is saveable', () => {
  const original = drawing()
  const split = splitDrawingSegment(original, 'a', 0.37)
  assert.equal(split.vertexs.length, 3)
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const actual =
      t <= 0.37
        ? segment(split.vertexs[0], split.vertexs[1], t / 0.37)
        : segment(split.vertexs[1], split.vertexs[2], (t - 0.37) / 0.63)
    pointApprox(actual, segment(original.vertexs[0], original.vertexs[1], t))
  }
  assert.equal(original.vertexs[0].nextHandlerY, 100)
  roundtrip(split)
})

test('true cubic extrema update bounds after control-handle and anchor edits', () => {
  const bounded = recalculateDrawingBounds(drawing({ width: 1, height: 1, center: { x: 0, y: 0 } }))
  approx(bounded.width, 100)
  approx(bounded.height, 75)
  pointApprox(bounded.center, { x: 50, y: 37.5 })
  const changed = recalculateDrawingBounds(
    drawing({
      vertexs: [
        { id: 'a', type: 'M', x: 0, y: 0, nextHandlerX: 0, nextHandlerY: 200 },
        { id: 'b', type: 'C', x: 100, y: 0, currentHandlerX: 100, currentHandlerY: 200 },
      ],
    }),
  )
  approx(changed.height, 150)
})

test('transforms include compound contours and clipping geometry while preserving image source', () => {
  const image = {
    src: 'data:image/png;base64,AA==',
    naturalWidth: 640,
    naturalHeight: 480,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  }
  const source = {
    ...rectangle('image', 0, 0, 100, 80),
    type: 'IMAGE',
    image,
    subpaths: [rectangle('hole', 20, 20, 10, 10).vertexs],
    clip: { vertexs: rectangle('mask', 10, 10, 80, 60).vertexs, subpaths: [rectangle('hole', 30, 30, 10, 10).vertexs] },
  }
  const moved = translateDrawing(source, 20, -10)
  pointApprox(moved.subpaths[0][0], { x: 40, y: 10 })
  pointApprox(moved.clip.vertexs[0], { x: 30, y: 0 })
  pointApprox(moved.clip.subpaths[0][0], { x: 50, y: 20 })
  const rotated = rotateDrawingAround(source, 90, { x: 0, y: 0 })
  pointApprox(rotated.clip.vertexs[0], { x: -10, y: 10 })
  pointApprox(rotated.center, { x: -40, y: 50 })
  const scaled = resizeDrawing(source, 'BR', { x: 100, y: 80 }, { x: 150, y: 120 }, true)
  pointApprox(scaled.clip.vertexs[0], { x: -30, y: -20 })
  assert.strictEqual(scaled.image, image)
  assert.equal(scaled.width, 200)
})

test('multiple selection scales centers, curves and masks around a shared center', () => {
  const first = rectangle('first', 0, 0, 20, 20)
  const second = rectangle('second', 80, 0, 20, 20)
  const result = resizeDrawings([first, second], 'R', { x: 100, y: 10 }, { x: 150, y: 10 }, true)
  assert.equal(getSelectionBounds(result).width, 200)
  assert.equal(getSelectionBounds(result).height, 40)
  pointApprox(result[0].center, { x: -30, y: 10 })
  pointApprox(result[1].center, { x: 130, y: 10 })
})

test('vertex delete, smoothing, straightening and closure preserve valid document invariants', () => {
  const source = rectangle('closed', 0, 0, 100, 100)
  const open = toggleDrawingClosed(source)
  assert.equal(open.type, 'PATH')
  assert.equal(open.vertexs[0].type, 'M')
  const smooth = setDrawingVertexKind(open, 'b', 'smooth')
  assert.equal(smooth.vertexs[1].type, 'C')
  assert.equal(smooth.vertexs[2].type, 'C')
  const anchor = smooth.vertexs[1]
  approx(
    (anchor.currentHandlerX - anchor.x) * (anchor.nextHandlerY - anchor.y) -
      (anchor.currentHandlerY - anchor.y) * (anchor.nextHandlerX - anchor.x),
    0,
  )
  const straight = straightenDrawingSegment(smooth, 'b')
  assert.equal(straight.vertexs[2].type, 'L')
  const deleted = deleteDrawingVertex(smooth, 'a')
  assert.equal(deleted.vertexs[0].type, 'M')
  for (const value of [
    open,
    smooth,
    straight,
    deleted,
    toggleDrawingClosed(smooth),
    setDrawingVertexKind(smooth, 'b', 'corner'),
  ])
    roundtrip(value)
  const minimal = drawing()
  assert.strictEqual(deleteDrawingVertex(minimal, 'a'), minimal)
})

test('splitting closing cubic segment is valid and does not change its contour', () => {
  const source = setDrawingVertexKind(rectangle('shape', 0, 0, 60, 40), 'a', 'smooth')
  const split = splitDrawingSegment(source, 'd')
  assert.equal(split.vertexs.length, 5)
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    pointApprox(
      t < 0.5
        ? segment(split.vertexs[3], split.vertexs[4], t * 2)
        : segment(split.vertexs[4], split.vertexs[0], (t - 0.5) * 2),
      segment(source.vertexs[3], source.vertexs[0], t),
    )
  }
  roundtrip(split)
})

test('pencil conversion preserves existing smoothing; iterative RDP retains endpoints and turns', () => {
  const vertices = [
    { id: 'a', type: null, x: 0, y: 0 },
    { id: 'b', type: null, x: 10, y: 10 },
    { id: 'c', type: null, x: 20, y: 0 },
  ]
  const pencil = drawing({ type: 'SPLINE', vertexs: vertices })
  const converted = convertSplineToPath(pencil)
  pointApprox({ x: converted.vertexs[0].nextHandlerX, y: converted.vertexs[0].nextHandlerY }, { x: 2, y: 2 })
  pointApprox({ x: converted.vertexs[1].currentHandlerX, y: converted.vertexs[1].currentHandlerY }, { x: 14, y: 10 })
  roundtrip(converted)
  const dense = Array.from({ length: 10000 }, (_, index) => ({ id: `v${index}`, type: null, x: index, y: 2 * index }))
  const simplified = simplifyVertices(dense, 1)
  assert.deepEqual(
    simplified.map((vertex) => vertex.id),
    ['v0', 'v9999'],
  )
  assert.equal(simplifyVertices(vertices, 1).length, 3)
  const result = simplifyDrawing(drawing({ type: 'SPLINE', vertexs: dense }), 1)
  assert.equal(result.type, 'PATH')
  assert.equal(result.vertexs.length, 2)
  roundtrip(result)
})

test('snapping threshold is six screen pixels and exact alignments outrank nearby candidates', () => {
  const target = rectangle('target', 100, 200, 20, 20)
  assert.equal(snapPoint({ x: 104, y: 197 }, [target], 1, false).point.x, 100)
  assert.equal(snapPoint({ x: 104, y: 197 }, [target], 2, false).point.x, 104)
  assert.deepEqual(snapPoint({ x: 24, y: 37 }, [], 1, true).point, { x: 20, y: 40 })
  const moving = rectangle('moving', 0, 0, 20, 20)
  const translated = snapTranslation([moving], [target], { x: 100, y: 200 }, 1, false)
  assert.deepEqual(translated.point, { x: 100, y: 200 })
  assert.equal(translated.guides.length, 2)
})

test('deleting a cubic source repairs the newly adjacent control connection', () => {
  const source = drawing({
    vertexs: [
      { id: 'a', type: 'M', x: 0, y: 0 },
      { id: 'b', type: 'L', x: 10, y: 10, nextHandlerX: 20, nextHandlerY: 20 },
      { id: 'c', type: 'C', x: 40, y: 0, currentHandlerX: 30, currentHandlerY: 20 },
    ],
  })
  const deleted = deleteDrawingVertex(source, 'b')
  assert.equal(deleted.vertexs[0].nextHandlerX, 0)
  roundtrip(deleted)
})
