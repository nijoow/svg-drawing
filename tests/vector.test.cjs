const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')
const {
  booleanDrawings,
  createVectorScope,
  paperDrawing,
  replaceBooleanSelection,
} = require('../src/vector/boolean.ts')
const {
  createDocument,
  drawingToPathData,
  parseDocument,
  serializeDocument,
  exportDocumentSvg,
} = require('../src/editor/document.ts')
const { appendImportedSvg, svgTransform, validateSvgSource } = require('../src/vector/importSvg.ts')
const { exportReactComponent, jsxStyle } = require('../src/vector/export.ts')

const rectangle = (id, x, y, width, height) => ({
  id,
  type: 'POLYGON',
  subType: null,
  width,
  height,
  center: { x: x + width / 2, y: y + height / 2 },
  rotate: 0,
  vertexs: [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ].map(([x, y], index) => ({ id: `${id}-${index}`, type: 'L', x, y })),
  fill: '#123456',
  stroke: 'none',
  strokeWidth: 0,
  opacity: 1,
})

async function measure(drawing) {
  if (!drawing) return 0
  const scope = await createVectorScope()
  try {
    return Math.abs(new scope.CompoundPath({ pathData: drawingToPathData(drawing), insert: false }).area)
  } finally {
    scope.project.remove()
  }
}

test('boolean operations perform geometry and survive editable document round trips', async () => {
  const inputs = [rectangle('a', 0, 0, 10, 10), rectangle('b', 5, 0, 10, 10)]
  for (const [operation, expected] of [
    ['union', 150],
    ['subtract', 50],
    ['intersect', 50],
    ['exclude', 100],
  ]) {
    const result = await booleanDrawings(inputs, operation)
    assert.ok(result)
    assert.ok(Math.abs((await measure(result)) - expected) < 0.001, operation)
    const restored = parseDocument(serializeDocument({ ...createDocument(), drawings: [result] }))
    assert.ok(Math.abs((await measure(restored.drawings[0])) - expected) < 0.001, `${operation} restored`)
  }
  assert.equal(await booleanDrawings([inputs[0], rectangle('far', 30, 0, 10, 10)], 'intersect'), null)
})

test('subtraction preserves compound holes and cubic intersections retain curve controls', async () => {
  const hole = await booleanDrawings(
    [rectangle('outer', 0, 0, 100, 100), rectangle('inner', 25, 25, 50, 50)],
    'subtract',
  )
  assert.equal(hole.subpaths.length, 1)
  assert.ok(Math.abs((await measure(hole)) - 7500) < 0.001)
  const scope = await createVectorScope()
  let circles
  try {
    circles = [0, 10].map((x) => paperDrawing(new scope.Path.Circle({ center: [x, 0], radius: 10, insert: false })))
  } finally {
    scope.project.remove()
  }
  const lens = await booleanDrawings(circles, 'intersect')
  assert.ok(lens.vertexs.length >= 3)
  assert.ok(lens.vertexs.some((vertex) => vertex.type === 'C'))
  const result = parseDocument(serializeDocument({ ...createDocument(), drawings: [lens] })).drawings[0]
  assert.ok(Math.abs((await measure(result)) - 122.83697) < 0.2)
})

test('shape operations reject unsupported objects and preserve unrelated layer ordering', async () => {
  const a = rectangle('a', 0, 0, 10, 10),
    b = rectangle('b', 5, 0, 10, 10)
  await assert.rejects(booleanDrawings([a, { ...b, type: 'TEXT' }], 'union'), /text and images/)
  await assert.rejects(booleanDrawings([a, { ...b, locked: true }], 'union'), /Unlock/)
  const between = rectangle('between', 0, 0, 2, 2)
  const after = rectangle('after', 0, 0, 2, 2)
  const result = await booleanDrawings([a, b], 'union')
  assert.deepEqual(
    replaceBooleanSelection([a, between, b, after], ['a', 'b'], result).map((drawing) => drawing.id),
    ['between', result.id, 'after'],
  )
  assert.deepEqual(replaceBooleanSelection([a, between, b], ['a', 'b'], null), [between])
})

test('SVG transforms compose in SVG order, and grouped imports build valid documents', async () => {
  const scope = await createVectorScope()
  try {
    const point = svgTransform(scope, 'translate(10 20) scale(2) rotate(90)').transform(new scope.Point(3, 0))
    assert.ok(Math.abs(point.x - 10) < 0.001)
    assert.ok(Math.abs(point.y - 26) < 0.001)
    assert.throws(() => svgTransform(scope, 'rotate(nope)'), /coordinate/)
  } finally {
    scope.project.remove()
  }
  const drawing = { ...rectangle('imported', 0, 0, 20, 20), groupId: 'group-imported' }
  const doc = appendImportedSvg(createDocument(), [drawing])
  assert.equal(parseDocument(serializeDocument(doc)).groups[0].id, 'group-imported')
  assert.throws(() => validateSvgSource('<!DOCTYPE svg><svg/>'), /document types/)
  assert.throws(() => validateSvgSource(''), /empty/)
})

test('React export escapes text and braces, converts SVG attributes and emits valid TSX', () => {
  const doc = {
    ...createDocument(),
    name: 'Icon {alert(1)} <tag> & "quoted"',
    drawings: [rectangle('icon', 0, 0, 10, 10)],
  }
  const source = exportReactComponent(exportDocumentSvg(doc), '123 icon-name')
  assert.match(source, /function Drawing123IconName/)
  assert.match(source, /strokeWidth=/)
  assert.match(source, /\{\.\.\.props\}/)
  assert.ok(source.includes(JSON.stringify(doc.name)))
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
    fileName: 'drawing.tsx',
  })
  assert.equal(compiled.diagnostics.length, 0)
  assert.deepEqual(jsxStyle('mix-blend-mode: multiply; filter: brightness(0.8); --color: red'), {
    mixBlendMode: 'multiply',
    filter: 'brightness(0.8)',
    '--color': 'red',
  })
  assert.throws(() => exportReactComponent('<svg><script>alert(1)</script></svg>'), /unsupported element/)
})

test('React gradient exports scope references separately for each rendered component instance', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const drawing = {
    ...rectangle('gradient', 0, 0, 10, 10),
    gradient: {
      type: 'linear',
      angle: 45,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' },
      ],
    },
    effects: { brightness: 1.2, contrast: 1, saturation: 1, grayscale: 0, blur: 0, hue: 0 },
  }
  const source = exportReactComponent(exportDocumentSvg({ ...createDocument(), drawings: [drawing] }))
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
    fileName: 'drawing.tsx',
  })
  assert.equal(compiled.diagnostics.length, 0)
  const exports = {}
  new Function('require', 'exports', compiled.outputText)(require, exports)
  const rendered = renderToStaticMarkup(
    React.createElement('div', null, React.createElement(exports.default), React.createElement(exports.default)),
  )
  const ids = Array.from(rendered.matchAll(/\bid="([^"]+)"/g), (match) => match[1])
  assert.equal(ids.length, 4)
  assert.equal(new Set(ids).size, 4)
  for (const id of ids) assert.ok(rendered.includes(`url(#${id})`))
})
