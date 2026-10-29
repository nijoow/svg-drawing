// Run with Playwright available in the host environment; no app dependencies added.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

;(async () => {
  const base = process.env.BASE_URL || 'http://localhost:4313'
  const output = process.env.EVIDENCE_DIR || '/tmp/svg-ux-evidence'
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  const button = (name) => page.getByRole('button', { name, exact: true })
  const field = (name) => page.getByRole('spinbutton', { name, exact: true })
  const edit = async (name, value) => {
    await field(name).fill(String(value))
    await field(name).press('Enter')
  }
  const fileMenu = async () => {
    await button('File').click()
  }
  const download = async (name) => {
    await fileMenu()
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page
        .getByRole('button', {
          name: name === 'Save project' ? /^Save project / : name,
          exact: name !== 'Save project',
        })
        .click(),
    ])
    const target = path.join(output, file.suggestedFilename())
    await file.saveAs(target)
    return target
  }
  const checkValue = async (name, value) => {
    await page.waitForFunction(
      ({ name, value }) => document.querySelector(`input[aria-label="${name}"]`)?.value === String(value),
      { name, value },
    )
  }
  try {
    await page.goto(base)
    await page.getByText('Saved in this browser', { exact: true }).waitFor()
    await button('Draw rectangle').click()
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(520, 450, { steps: 8 })
    await page.mouse.up()
    await button('Properties').click()
    await checkValue('Width', 220)
    await edit('Rotation', 30)
    await edit('Width', 280)
    await button('Undo').click()
    await checkValue('Width', 220)
    await button('Redo').click()
    await checkValue('Width', 280)
    await checkValue('Rotation', 30)
    assert.equal(await page.getByLabel('Object name', { exact: true }).inputValue(), 'Rectangle')
    await edit('Stroke width', 4)
    const color = page.getByLabel('Object fill color', { exact: true })
    await color.fill('#2288cc')
    await field('Width').focus()
    await button('Close panel').click()
    // Canvas drag and keyboard movement still use the selected object.
    await page.mouse.move(410, 375)
    await page.mouse.down()
    await page.mouse.move(450, 405, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.press('ArrowRight')
    await button('Properties').click()
    const x = Number(await field('X').inputValue())
    assert.ok(x > 300)
    const projectFile = await download('Save project')
    const project = JSON.parse(await fs.readFile(projectFile, 'utf8'))
    assert.equal(project.drawings.length, 1)
    assert.equal(project.drawings[0].width, 280)
    const svgFile = await download('Export SVG')
    const svg = await fs.readFile(svgFile, 'utf8')
    assert.ok(svg.includes('viewBox=') && svg.includes('<path'))
    await edit('Width', 310)
    await page.getByLabel('Open project file', { exact: true }).setInputFiles(projectFile)
    await page.getByText('Saved in this browser', { exact: true }).waitFor()
    await page.keyboard.press('Control+a')
    await checkValue('Width', 280)
    const before = await page.evaluate(() => localStorage.getItem('svg-drawing.document.v1'))
    await page
      .getByLabel('Open project file', { exact: true })
      .setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
    await page.getByText('The file is not valid JSON.', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('svg-drawing.document.v1')), before)
    await button('Dismiss').click()
    await page.screenshot({ path: path.join(output, 'desktop.png') })
    await page.reload()
    await page.getByText('Saved in this browser', { exact: true }).waitFor()
    await page.keyboard.press('Control+a')
    await button('Properties').click()
    await checkValue('Width', 280)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByText('Saved in this browser', { exact: true }).waitFor()
    assert.equal(await page.locator('#editor-panel').count(), 0)
    await page.keyboard.press('Control+a')
    await button('Properties').click()
    const sheet = await page.locator('#editor-panel').boundingBox()
    assert.ok(sheet.x >= 0 && sheet.x + sheet.width <= 390 && sheet.height <= 844 * 0.42 + 1)
    assert.ok(sheet.y > 300)
    await checkValue('Width', 280)
    await edit('Width', 290)
    await button('Undo').click()
    await checkValue('Width', 280)
    await page.screenshot({ path: path.join(output, 'mobile-390.png') })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
    assert.deepEqual(errors, [])
    await fs.writeFile(
      path.join(output, 'result.json'),
      JSON.stringify(
        {
          base,
          status: 'passed',
          checks: [
            'draw/select',
            'numeric rotate/resize',
            'undo/redo retains selection',
            'stroke/fill',
            'pointer and keyboard move',
            'save/open project roundtrip',
            'corrupt file preserves document',
            'SVG export',
            'autosave restore',
            '390px closed default and bounded sheet',
          ],
          browserErrors: errors,
        },
        null,
        2,
      ),
    )
    console.log('Editor UX browser verification passed:', base)
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
