const test = require('node:test')
const assert = require('node:assert/strict')
const { importSvgFile } = require('../src/vector/importSvg.ts')
const { MAX_DOCUMENT_BYTES } = require('../src/editor/document.ts')

test('SVG file boundary rejects excessive bytes before reading and preserves source validation errors', async () => {
  let reads = 0
  await assert.rejects(
    importSvgFile({
      size: MAX_DOCUMENT_BYTES + 1,
      text() {
        reads++
        return ''
      },
    }),
    /smaller than 10 MB/,
  )
  assert.equal(reads, 0)
  await assert.rejects(
    importSvgFile({
      size: 0,
      async text() {
        return ''
      },
    }),
    /file is empty/,
  )
  await assert.rejects(
    importSvgFile({
      size: 100,
      async text() {
        return '<!DOCTYPE svg><svg/>'
      },
    }),
    /document types/,
  )
  await assert.rejects(
    importSvgFile({
      size: 100,
      async text() {
        throw new Error('read failed')
      },
    }),
    /read failed/,
  )
})
