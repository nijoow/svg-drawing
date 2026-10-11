const assert = require('node:assert/strict')
const test = require('node:test')
const { createTextDrawing, reflowTextDrawing, measureTextLayout } = require('../src/media/text')
const { resizeMediaFrame, rectangleVertices } = require('../src/media/frame')
const { rotateDrawing } = require('../src/utils/drawingGeometry')
const {
  cropImageDrawing,
  cropForAspectRatio,
  normalizeCrop,
  validateImageDimensions,
  importImageFile,
  FULL_CROP,
  MAX_IMAGE_BYTES,
} = require('../src/media/image')

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`)

function imageDrawing() {
  return {
    id: 'image',
    type: 'IMAGE',
    subType: null,
    rotate: 0,
    width: 400,
    height: 200,
    center: { x: 210, y: 120 },
    vertexs: rectangleVertices({ x: 10, y: 20 }, 400, 200),
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
    image: { src: 'original-pixels', naturalWidth: 800, naturalHeight: 400, crop: { ...FULL_CROP } },
  }
}

test('text layout retains Korean, blank lines and line breaks with measured spacing', () => {
  const layout = measureTextLayout(
    { content: '한글\r\n\r\nAB', fontSize: 20, lineHeight: 1.5, letterSpacing: 3 },
    (line) => (line === '한글' ? 40 : line.length * 10),
  )
  assert.equal(layout.content, '한글\n\nAB')
  assert.equal(layout.naturalWidth, 43)
  assert.equal(layout.naturalHeight, 85)
  const empty = measureTextLayout({ content: '', fontSize: 20 }, () => 0)
  assert.ok(empty.naturalWidth > 0 && empty.naturalHeight > 0)
  const tightLines = measureTextLayout({ content: 'A\nB\nC', fontSize: 20, lineHeight: 0.5 }, () => 10)
  assert.equal(tightLines.naturalHeight, 45)
})

test('new text has editable rectangle geometry and no presentation fields inside text metadata', () => {
  const drawing = createTextDrawing({ x: 50, y: 80 }, { content: '안녕', fill: '#ff0000' })
  assert.equal(drawing.type, 'TEXT')
  assert.equal(drawing.fill, '#ff0000')
  assert.equal(drawing.text.content, '안녕')
  assert.equal(drawing.text.fill, undefined)
  assert.equal(drawing.vertexs.length, 4)
  assert.equal(drawing.vertexs[0].x, 50)
  assert.equal(drawing.vertexs[0].y, 80)
  assert.throws(() => measureTextLayout({ content: 'x'.repeat(10001) }), /10,000/)
})

test('editing text preserves rotated origin and existing object scale', () => {
  let drawing = createTextDrawing({ x: 10, y: 20 }, { content: 'AB', fontSize: 20 })
  drawing = resizeMediaFrame(drawing, drawing.width * 2, drawing.height * 3)
  drawing = rotateDrawing(drawing, 35)
  const originalStart = { ...drawing.vertexs[0] }
  const updated = reflowTextDrawing(drawing, { content: '한국어' }, () => 60)
  near(updated.width / updated.text.naturalWidth, 2)
  near(updated.height / updated.text.naturalHeight, 3)
  near(updated.vertexs[0].x, originalStart.x)
  near(updated.vertexs[0].y, originalStart.y)
  assert.equal(updated.rotate, 35)
  assert.deepEqual(
    updated.vertexs.map((vertex) => vertex.id),
    drawing.vertexs.map((vertex) => vertex.id),
  )
})

test('image crop and reset preserve original data, scale and rotated anchor', () => {
  const drawing = rotateDrawing(imageDrawing(), 90)
  const cropped = cropImageDrawing(drawing, { x: 0.25, y: 0.1, width: 0.5, height: 0.75 })
  assert.equal(cropped.image.src, 'original-pixels')
  assert.equal(cropped.width, 200)
  assert.equal(cropped.height, 150)
  near(cropped.vertexs[0].x, drawing.vertexs[0].x)
  near(cropped.vertexs[0].y, drawing.vertexs[0].y)
  const reset = cropImageDrawing(cropped, FULL_CROP)
  near(reset.width, drawing.width)
  near(reset.height, drawing.height)
  reset.vertexs.forEach((vertex, index) => {
    near(vertex.x, drawing.vertexs[index].x)
    near(vertex.y, drawing.vertexs[index].y)
  })
})

test('media reflow preserves reflection and transforms a clip together with its frame', () => {
  const drawing = imageDrawing()
  drawing.vertexs = [drawing.vertexs[3], drawing.vertexs[2], drawing.vertexs[1], drawing.vertexs[0]]
  drawing.clip = { vertexs: drawing.vertexs.map((vertex) => ({ ...vertex })) }
  const updated = resizeMediaFrame(drawing, 200, 100)
  assert.equal(updated.vertexs[0].x, 410)
  assert.equal(updated.vertexs[3].x, 210)
  updated.clip.vertexs.forEach((vertex, index) => {
    near(vertex.x, updated.vertexs[index].x)
    near(vertex.y, updated.vertexs[index].y)
  })
})

test('crop bounds cannot escape source and presets produce correct source aspect', () => {
  assert.deepEqual(normalizeCrop({ x: 10, y: -1, width: 0.5, height: 2 }), { x: 0.5, y: 0, width: 0.5, height: 1 })
  assert.deepEqual(normalizeCrop({ x: NaN, y: Infinity, width: 0, height: NaN }), {
    x: 0,
    y: 0,
    width: 0.01,
    height: 1,
  })
  const crop = cropForAspectRatio(800, 400, 1)
  near((800 * crop.width) / (400 * crop.height), 1)
  near(crop.x, 0.25)
  near(crop.y, 0)
  assert.deepEqual(cropForAspectRatio(0, 400, 1), FULL_CROP)
})

test('image import rejects unsupported types and excessive bytes before browser decode', async () => {
  await assert.rejects(importImageFile({ type: 'image/svg+xml', size: 10 }, { x: 0, y: 0 }), /PNG, JPEG or WebP/)
  await assert.rejects(importImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }, { x: 0, y: 0 }), /6 MB/)
  assert.throws(() => validateImageDimensions(9000, 1), /8,192/)
  assert.throws(() => validateImageDimensions(8000, 8000), /32 megapixels/)
  assert.throws(() => validateImageDimensions(10.5, 5), /invalid dimensions/)
  assert.doesNotThrow(() => validateImageDimensions(6000, 4000))
})
