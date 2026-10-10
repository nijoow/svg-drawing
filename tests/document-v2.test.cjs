const assert = require('node:assert/strict')
const test = require('node:test')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const {
  createDocument,
  parseDocument,
  serializeDocument,
  exportDocumentSvg,
  getDrawingBounds,
  drawingToPathData,
  embeddedImageDimensions,
} = require('../src/editor/document.ts')
const { DrawingContent } = require('../src/components/Drawings/DrawingNode.tsx')
const { rotateDrawing } = require('../src/utils/drawingGeometry.ts')

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jEioAAAAASUVORK5CYII='
const contour = (prefix = 'v', offset = 0) => [
  { id: `${prefix}0`, type: 'M', x: offset, y: offset },
  { id: `${prefix}1`, type: 'L', x: offset + 100, y: offset },
  { id: `${prefix}2`, type: 'L', x: offset + 100, y: offset + 80 },
  { id: `${prefix}3`, type: 'L', x: offset, y: offset + 80 },
]
const shape = (overrides = {}) => ({
  id: 'shape-1',
  type: 'POLYGON',
  subType: null,
  vertexs: contour(),
  width: 100,
  height: 80,
  center: { x: 50, y: 40 },
  rotate: 0,
  fill: '#000000',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
  ...overrides,
})
const document = (drawings = [shape()]) => ({ ...createDocument(), id: 'v2-document', drawings })
const mediaContour = () => {
  const vertices = contour()
  return [vertices[0], vertices[3], vertices[2], vertices[1]]
}
const text = () =>
  shape({
    type: 'TEXT',
    vertexs: mediaContour(),
    text: {
      content: '한글 <script>\nsecond & "line"',
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: 400,
      fontStyle: 'normal',
      align: 'center',
      lineHeight: 1.2,
      letterSpacing: 1,
      naturalWidth: 100,
      naturalHeight: 48,
    },
  })
const image = () =>
  shape({
    type: 'IMAGE',
    vertexs: mediaContour(),
    image: { src: png, naturalWidth: 1, naturalHeight: 1, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
  })

test('version 1 documents migrate without changing geometry and save back as version 2', () => {
  const { groups, artboards, ...legacy } = document()
  legacy.version = 1
  const migrated = parseDocument(JSON.stringify(legacy))
  assert.equal(migrated.version, 2)
  assert.deepEqual(migrated.drawings, legacy.drawings)
  assert.deepEqual(migrated.groups, [])
  assert.deepEqual(migrated.artboards, [])
  assert.deepEqual(parseDocument(serializeDocument(migrated)), migrated)
})

test('nested groups, artboards and metadata round-trip; dangling references and group cycles are rejected', () => {
  const doc = document([shape({ name: '사각형', groupId: 'inner', artboardId: 'board', hidden: false, locked: true })])
  doc.groups = [
    { id: 'outer', name: 'Outer' },
    { id: 'inner', name: 'Inner', parentId: 'outer' },
  ]
  doc.artboards = [{ id: 'board', name: 'Icon', x: -10, y: 20, width: 512, height: 256 }]
  assert.deepEqual(parseDocument(serializeDocument(doc)), doc)
  const invalid = [
    { ...doc, groups: [] },
    { ...doc, artboards: [] },
    { ...doc, groups: [{ id: 'outer', name: 'Outer', parentId: 'inner' }, doc.groups[1]] },
    { ...doc, groups: [...doc.groups, doc.groups[0]] },
    { ...doc, artboards: [{ ...doc.artboards[0], id: 'shape-1' }] },
    { ...doc, drawings: [shape({ locked: 'true' })] },
  ]
  invalid.forEach((value) =>
    assert.throws(() => parseDocument(JSON.stringify(value)), { name: 'DocumentValidationError' }),
  )
})

test('compound contours and masks retain holes, reject duplicate anchor IDs and contribute to the bounds', () => {
  const compound = shape({
    subpaths: [contour('hole', 200)],
    clip: { vertexs: contour('clip'), subpaths: [contour('clip-hole', 20)] },
  })
  const parsed = parseDocument(serializeDocument(document([compound]))).drawings[0]
  assert.deepEqual(parsed, compound)
  assert.equal((drawingToPathData(parsed).match(/Z/g) ?? []).length, 2)
  assert.equal(getDrawingBounds(parsed).maxX, 300)
  const svg = exportDocumentSvg(document([compound]))
  assert.match(svg, /fill-rule="evenodd"/)
  assert.match(svg, /clipPathUnits="userSpaceOnUse"/)
  assert.match(svg, /clip-rule="evenodd"/)
  assert.throws(() => serializeDocument(document([shape({ subpaths: [contour()] })])), /unique across/)
})

test('hidden objects do not affect artwork exports; an artboard export uses its exact rectangle', () => {
  const doc = document([shape(), shape({ id: 'hidden', hidden: true, vertexs: contour('hidden', 9000) })])
  doc.artboards = [{ id: 'board', name: 'Board', x: -10, y: -20, width: 24, height: 32 }]
  assert.match(exportDocumentSvg(doc), /viewBox="0 0 100 80"/)
  assert.doesNotMatch(exportDocumentSvg(doc), /9000/)
  assert.match(exportDocumentSvg(doc, { artboardId: 'board' }), /viewBox="-10 -20 24 32"/)
  assert.throws(() => exportDocumentSvg(doc, { artboardId: 'missing' }), /does not exist/)
})

test('gradient, blend and non-destructive filters survive round-trip and use bounded SVG filter regions', () => {
  const drawing = shape({
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff80' },
      ],
    },
    blendMode: 'multiply',
    effects: { brightness: 1.2, contrast: 0.8, saturation: 0.7, grayscale: 0.2, hue: 30, blur: 2 },
  })
  assert.deepEqual(parseDocument(serializeDocument(document([drawing]))).drawings[0], drawing)
  const svg = exportDocumentSvg(document([drawing]))
  assert.match(svg, /<linearGradient /)
  assert.match(svg, /mix-blend-mode:multiply/)
  assert.match(svg, /filterUnits="userSpaceOnUse" x="-6" y="-6" width="112" height="92"/)
  assert.match(svg, /<feGaussianBlur stdDeviation="2"/)
  assert.match(svg, /<feColorMatrix type="hueRotate" values="30"/)
  assert.equal(getDrawingBounds(drawing).width, 112)
  assert.throws(
    () => serializeDocument(document([shape({ ...drawing, effects: { ...drawing.effects, blur: 101 } })])),
    /Blur/,
  )
  assert.throws(
    () =>
      serializeDocument(
        document([
          shape({ ...drawing, gradient: { ...drawing.gradient, stops: [...drawing.gradient.stops].reverse() } }),
        ]),
      ),
    /ordered/,
  )
})

test('multiline Korean text is escaped, positioned and transformed while native text stays editable', () => {
  const drawing = rotateDrawing(text(), 25)
  assert.deepEqual(parseDocument(serializeDocument(document([drawing]))).drawings[0], drawing)
  const svg = exportDocumentSvg(document([drawing]))
  assert.match(svg, /<text /)
  assert.match(svg, /transform="matrix\(/)
  const transform = svg
    .match(/transform="matrix\(([^)]+)\)"/)[1]
    .split(' ')
    .map(Number)
  assert.ok(Math.abs(transform[0] - Math.cos((25 * Math.PI) / 180)) < 1e-10)
  assert.ok(Math.abs(transform[1] - Math.sin((25 * Math.PI) / 180)) < 1e-10)
  assert.match(svg, /text-anchor="middle"/)
  assert.match(svg, /<tspan x="50" y="20">한글 &lt;script&gt;<\/tspan>/)
  assert.match(svg, /<tspan x="50" y="44">second &amp; &quot;line&quot;<\/tspan>/)
  assert.doesNotMatch(svg, /<script>/)
})

test('raster crop export is self-contained and rejects active content or misleading image dimensions', () => {
  assert.deepEqual(embeddedImageDimensions(png), { width: 1, height: 1 })
  const drawing = image()
  assert.deepEqual(parseDocument(serializeDocument(document([drawing]))).drawings[0], drawing)
  const svg = exportDocumentSvg(document([drawing]))
  assert.match(svg, /viewBox="0.25 0.25 0.5 0.5"/)
  assert.ok(svg.includes(png))
  for (const patch of [
    { src: 'https://example.com/image.png' },
    { src: 'data:image/svg+xml;base64,PHN2Zy8+' },
    { src: 'data:image/png;base64,PHN2Zy8+' },
    { naturalWidth: 20000, naturalHeight: 20000 },
    { naturalWidth: 2 },
    { crop: { x: 0.9, y: 0, width: 0.5, height: 1 } },
  ]) {
    assert.throws(() => serializeDocument(document([{ ...drawing, image: { ...drawing.image, ...patch } }])), {
      name: 'DocumentValidationError',
    })
  }
})

test('PNG intrinsic dimensions are checked before trusting a small declared pixel count', () => {
  const bytes = Buffer.from(png.split(',')[1], 'base64')
  bytes.writeUInt32BE(100000, 16)
  const drawing = image()
  drawing.image.src = `data:image/png;base64,${bytes.toString('base64')}`
  assert.throws(() => serializeDocument(document([drawing])), /dimensions do not match/)
})

test('SVG coordinate optimization never rounds opacity, crop ratios or small native scale to zero', () => {
  const drawing = { ...image(), opacity: 0.25, width: 0.01, height: 0.01 }
  drawing.vertexs = drawing.vertexs.map((vertex) => ({ ...vertex, x: vertex.x / 10000, y: vertex.y / 8000 }))
  const svg = exportDocumentSvg(document([drawing]), { precision: 0 })
  assert.match(svg, /opacity="0.25"/)
  assert.match(svg, /matrix\(0.01 0 0 0.01 0 0\)/)
  assert.match(svg, /viewBox="0.25 0.25 0.5 0.5"/)
  assert.throws(() => exportDocumentSvg(document(), { precision: -1 }), /precision/)
})

test('reflected media retains its signed geometry in SVG and on-screen rendering', () => {
  const drawing = image()
  drawing.vertexs = drawing.vertexs.map((vertex) => ({ ...vertex, x: 100 - vertex.x }))
  const svg = exportDocumentSvg(document([drawing]))
  assert.match(svg, /matrix\(-100 0 0 80 100 0\)/)
  const canvas = renderToStaticMarkup(React.createElement(DrawingContent, { drawing }))
  assert.match(canvas, /matrix\(-100 0 0 80 100 0\)/)
})

test('shared SVG canvas uses the same markup with hit markers, hides objects and prevents selecting locked artwork', () => {
  const drawing = shape({
    locked: true,
    gradient: {
      type: 'radial',
      angle: 0,
      stops: [
        { offset: 0, color: '#fff' },
        { offset: 1, color: '#000' },
      ],
    },
  })
  const markup = renderToStaticMarkup(React.createElement('svg', {}, React.createElement(DrawingContent, { drawing })))
  assert.match(markup, /data-drawing-id="shape-1"/)
  assert.match(markup, /pointer-events="none"/)
  assert.match(markup, /<radialGradient /)
  assert.equal(renderToStaticMarkup(React.createElement(DrawingContent, { drawing: { ...drawing, hidden: true } })), '')
})
