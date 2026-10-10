const assert = require('node:assert/strict')
const test = require('node:test')
const {
  createDocument,
  parseDocument,
  serializeDocument,
  exportDocumentSvg,
  drawingToPathData,
  getDrawingBounds,
} = require('../src/editor/document.ts')

const line = (overrides = {}) => ({
  id: 'line-1',
  type: 'PATH',
  subType: null,
  vertexs: [
    { id: 'v1', type: 'M', x: -20, y: 30 },
    { id: 'v2', type: 'L', x: 40, y: 30 },
  ],
  width: 60,
  height: 0,
  center: { x: 10, y: 30 },
  rotate: 0,
  fill: 'none',
  stroke: '#123456',
  strokeWidth: 4,
  opacity: 0.75,
  ...overrides,
})
const document = (drawings = [line()]) => ({ ...createDocument(), id: 'document-1', name: '한글 아이콘', drawings })

test('document round-trips metadata, degenerate geometry, style and object order', () => {
  const doc = document([line(), line({ id: 'line-2', fill: '#abcd', stroke: 'none', rotate: 45 })])
  assert.deepEqual(parseDocument(serializeDocument(doc)), doc)
  assert.deepEqual(parseDocument(serializeDocument(createDocument())).drawings, [])
})

test('loading rejects corrupt or unsupported data before returning a document', () => {
  const invalid = [
    { ...document(), version: 999 },
    { ...document(), name: 'Invalid\u0000name' },
    { ...document(), canvas: { width: 0, height: 20 } },
    document([line({ type: 'TEXT' })]),
    document([line({ vertexs: [] })]),
    document([line({ width: null })]),
    document([line({ opacity: 2 })]),
    document([line({ center: { x: Infinity, y: 0 } })]),
    document([line(), line()]),
    document([
      line({
        vertexs: [
          { id: 'same', type: 'M', x: 0, y: 0 },
          { id: 'same', type: 'L', x: 1, y: 1 },
        ],
      }),
    ]),
    document([line({ type: 'ELLIPSE' })]),
    document([line({ type: 'SPLINE' })]),
    document([
      line({
        vertexs: [
          { id: 'v1', type: 'M', x: 0, y: 0 },
          { id: 'v2', type: 'C', x: 1, y: 1 },
        ],
      }),
    ]),
    document([
      line({
        vertexs: [
          { id: 'v1', type: 'M', x: 0, y: 0, nextHandlerX: 2 },
          { id: 'v2', type: 'L', x: 1, y: 1 },
        ],
      }),
    ]),
  ]
  invalid.forEach((doc) => assert.throws(() => parseDocument(JSON.stringify(doc)), { name: 'DocumentValidationError' }))
  assert.throws(() => parseDocument('{'), /JSON/)
  assert.throws(() => parseDocument(' '.repeat(10 * 1024 * 1024 + 1)), /10 MB/)
})

test('import strips unrecognized fields and rejects external or injected paint', () => {
  for (const fill of [
    'url(https://example.com/image.svg)',
    'url(#gradient)',
    'red" onload="alert(1)',
    '<script>',
    'expression(alert(1))',
  ]) {
    assert.throws(() => parseDocument(JSON.stringify(document([line({ fill })]))))
  }
  const doc = document([line({ onload: 'alert(1)' })])
  doc.script = 'unrecognized'
  const parsed = parseDocument(JSON.stringify(doc))
  assert.equal(parsed.script, undefined)
  assert.equal(parsed.drawings[0].onload, undefined)
})

test('SVG is standalone, escapes title and crops to artwork including strokes', () => {
  const doc = document()
  doc.name = 'Icon <script> & "title"'
  const svg = exportDocumentSvg(doc)
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.match(svg, /viewBox="-22 28 64 4"/)
  assert.match(svg, /<title>Icon &lt;script&gt; &amp; &quot;title&quot;<\/title>/)
  assert.ok(svg.includes(`d="${drawingToPathData(doc.drawings[0])}"`))
  assert.match(svg, /opacity="0.75"/)
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/)
})

test('curve bounds include handles outside vertex bounds and smooth reflected handles', () => {
  const curve = line({
    vertexs: [
      { id: 'v1', type: 'M', x: 0, y: 0, nextHandlerX: -50, nextHandlerY: -80 },
      { id: 'v2', type: 'C', x: 10, y: 10, currentHandlerX: 90, currentHandlerY: -100 },
      { id: 'v3', type: 'S', x: 20, y: 10, currentHandlerX: 25, currentHandlerY: 25 },
    ],
  })
  const bound = getDrawingBounds(curve)
  assert.deepEqual(bound, { minX: -72, minY: -102, maxX: 92, maxY: 122, width: 164, height: 224 })
  assert.ok(exportDocumentSvg(document([curve])).includes('viewBox="-72 -102 164 224"'))
})

test('spline export preserves smoothed path, forced unfilled style and round caps', () => {
  const spline = line({
    type: 'SPLINE',
    fill: '#ffffff',
    vertexs: [
      { id: 'v1', type: null, x: 0, y: 0 },
      { id: 'v2', type: null, x: 10, y: 10 },
      { id: 'v3', type: null, x: 20, y: 0 },
    ],
  })
  assert.equal(drawingToPathData(spline), 'M 0 0 C 2 2 14 10 10 10 C 14 10 22 -2 20 0')
  const bounds = getDrawingBounds(spline)
  assert.equal(bounds.maxX, 24)
  assert.equal(bounds.minY, -4)
  const svg = exportDocumentSvg(document([spline]))
  assert.match(svg, /fill="none"/)
  assert.match(svg, /stroke-linecap="round"/)
})

test('empty rendering and zero-size paths stay finite; empty export uses document canvas', () => {
  assert.equal(drawingToPathData(line({ vertexs: [] })), '')
  assert.deepEqual(getDrawingBounds(line({ vertexs: [] })), { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 })
  const drawing = line({
    stroke: 'none',
    vertexs: [
      { id: 'v1', type: 'M', x: 2, y: 3 },
      { id: 'v2', type: 'L', x: 2, y: 3 },
    ],
  })
  const bounds = getDrawingBounds(drawing)
  assert.equal(bounds.width, 1)
  assert.equal(bounds.height, 1)
  assert.match(exportDocumentSvg(document([])), /viewBox="0 0 1600 900"/)
})
