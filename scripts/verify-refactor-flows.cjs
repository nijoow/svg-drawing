// Real Chromium flows. File.text is delayed only in race tests; parsing/insertion stay real.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

;(async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:4327'
  const output = process.env.EVIDENCE_DIR || '/tmp/svg-refactor-flows'
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  const checks = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  const button = (name) => page.getByRole('button', { name, exact: true })
  const artwork = page.getByLabel('Artwork', { exact: true })
  const objects = () => artwork.locator(':scope > g[data-drawing-id]')
  const count = async (expected) => {
    await page.waitForFunction(
      (value) => document.querySelectorAll('svg[aria-label="Artwork"] > g[data-drawing-id]').length === value,
      expected,
    )
  }
  const saved = () => page.getByText('Saved in this browser', { exact: true }).waitFor()
  const fresh = async () => {
    await saved()
    await button('File').click()
    await button('New document').click()
    await count(0)
    await saved()
  }
  const closePanel = async () => {
    if (await button('Close panel').count()) await button('Close panel').click()
  }
  const drawRectangle = async () => {
    await closePanel()
    await button('Draw rectangle').click()
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(500, 440, { steps: 5 })
    await page.mouse.up()
  }
  const file = (name) => ({
    name,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect x="200" y="250" width="100" height="80" fill="#2288cc"/></svg>',
    ),
  })
  const picker = page.getByLabel('Import image file', { exact: true })
  const importing = page.getByText('Importing image…', { exact: true })
  try {
    await page.goto(base)
    await saved()
    await drawRectangle()
    await count(1)
    const originalPath = await objects().first().locator('path').getAttribute('d')
    for (let iteration = 0; iteration < 3; iteration++) {
      await page.mouse.move(400, 370)
      await page.mouse.down()
      await page.mouse.move(450, 400, { steps: 5 })
      await page.keyboard.press('Escape')
      await page.mouse.up()
      assert.equal(await objects().first().locator('path').getAttribute('d'), originalPath)
      await page.keyboard.press('Control+a')
    }
    checks.push('three repeated transform Escape cancellations preserve geometry')
    await page.mouse.move(400, 370)
    await page.mouse.down()
    await page.mouse.move(440, 410, { steps: 5 })
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.mouse.up()
    assert.equal(await objects().first().locator('path').getAttribute('d'), originalPath)
    checks.push('window blur cancels transform transaction')

    const name = page.getByLabel('Document name', { exact: true })
    await name.fill('cancel-this-name')
    await name.press('Escape')
    assert.equal(await name.inputValue(), 'Untitled')
    await count(1)
    await button('Properties').click()
    const width = page.getByRole('spinbutton', { name: 'Width', exact: true })
    await width.fill('333')
    await width.press('Escape')
    await width.press('Tab')
    assert.equal(await width.inputValue(), '200')
    checks.push('document and numeric drafts cancel without canvas shortcuts')
    await closePanel()

    // Native contenteditable fixtures exercise the browser's real isContentEditable semantics.
    for (const mode of ['', 'plaintext-only', 'true']) {
      await page.evaluate((value) => {
        const field = document.createElement('div')
        field.id = 'keyboard-fixture'
        field.setAttribute('contenteditable', value)
        field.style.cssText = 'position:fixed;left:600px;top:200px;z-index:100;background:white'
        field.textContent = 'draft'
        document.body.appendChild(field)
        field.focus()
      }, mode)
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
      await page.keyboard.press('Backspace')
      await page.keyboard.type('pna')
      await page.keyboard.press('Escape')
      await count(1)
      assert.equal(await button('Select').getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('#keyboard-fixture').textContent(), 'pna')
      await page.locator('#keyboard-fixture').evaluate((element) => element.remove())
    }
    checks.push('empty/plaintext/true contenteditable retain text editing and selection')

    await fresh()
    await button('Pencil').click()
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(330, 330)
    await page.mouse.move(360, 290)
    const preview = await artwork.locator(':scope > path').getAttribute('d')
    await page.mouse.up()
    await count(1)
    const numbers = (value) => value.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number)
    const previewNumbers = numbers(preview)
    const committed = await objects().first().locator('path').getAttribute('d')
    assert.deepEqual(numbers(committed), previewNumbers)
    for (let iteration = 0; iteration < 3; iteration++) {
      await button('Undo').click()
      await count(0)
      await button('Redo').click()
      await count(1)
      assert.equal(await objects().first().locator('path').getAttribute('d'), committed)
    }
    checks.push('pencil preview equals committed curve across three undo/redo cycles')
    await button('Select').click()
    await page.keyboard.press('Control+a')
    await button('Edit points').click()
    await button('Edit pencil points').click()
    assert.deepEqual(numbers(await objects().first().locator('path').getAttribute('d')).slice(2), previewNumbers)
    checks.push('pencil-to-editable conversion preserves displayed curve')
    await button('Pencil').click()
    await page.mouse.move(600, 400)
    await page.mouse.down()
    await page.mouse.move(650, 450)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await count(1)
    checks.push('Escape discards unfinished pencil stroke')

    await fresh()
    await page.evaluate(() => {
      const original = File.prototype.text
      window.pendingFileReads = {}
      File.prototype.text = function () {
        if (!this.name.startsWith('delay-')) return original.call(this)
        const file = this
        return new Promise((resolve, reject) => {
          window.pendingFileReads[file.name] = async (fail) =>
            fail ? reject(new Error('Delayed read failed')) : resolve(await original.call(file))
        })
      }
    })
    const release = (name, fail = false) =>
      page.evaluate(({ name, fail }) => window.pendingFileReads[name](fail), { name, fail })
    await picker.setInputFiles(file('delay-first.svg'))
    await picker.setInputFiles(file('delay-second.svg'))
    await importing.waitFor()
    await release('delay-second.svg')
    await count(1)
    assert.equal(await importing.count(), 1)
    await release('delay-first.svg')
    await count(2)
    await importing.waitFor({ state: 'hidden' })
    checks.push('out-of-order concurrent imports both complete; pending status covers all reads')
    await picker.setInputFiles(file('repeat.svg'))
    await count(3)
    await picker.setInputFiles(file('repeat.svg'))
    await count(4)
    checks.push('same file can be imported repeatedly through real file input')

    for (const fail of [false, true]) {
      const delayed = `delay-replaced-${fail}.svg`
      await picker.setInputFiles(file(delayed))
      await importing.waitFor()
      await fresh()
      await release(delayed, fail)
      await importing.waitFor({ state: 'hidden' })
      await count(0)
      assert.equal(await page.getByLabel('Document controls', { exact: true }).getByRole('alert').count(), 0)
    }
    checks.push('document replacement rejects stale import results and stale errors')
    await page.getByLabel('Import SVG file', { exact: true }).setInputFiles(file('toolbar.svg'))
    await count(1)
    await picker.setInputFiles({
      name: 'active.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    })
    await page.getByLabel('Document controls', { exact: true }).getByRole('alert').waitFor()
    await count(1)
    await button('Dismiss').click()
    checks.push('toolbar import shares parser; active SVG rejection preserves artwork')
    await picker.setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4YQAAAAASUVORK5CYII=',
        'base64',
      ),
    })
    await count(2)
    await page.getByLabel('Image properties', { exact: true }).waitFor()
    checks.push('raster import retains image properties entry point')
    await saved()
    await page.screenshot({ path: path.join(output, 'refactor-desktop.png') })
    await page.reload()
    await saved()
    await count(2)
    checks.push('imported vector and raster survive autosave reload')
    assert.deepEqual(errors, [])
    await fs.writeFile(
      path.join(output, 'result.json'),
      JSON.stringify({ base, status: 'passed', checks, browserErrors: errors }, null, 2),
    )
    console.log(`Refactor browser verification passed: ${checks.length} checks`)
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') })
    await fs.writeFile(
      path.join(output, 'failure.json'),
      JSON.stringify({ checks, browserErrors: errors, error: String(error) }, null, 2),
    )
    throw error
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
