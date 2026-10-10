const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const originalResolve = Module._resolveFilename
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request.startsWith('@/')) {
    request = path.resolve(__dirname, '../src', request.slice(2))
  }
  return originalLoad.call(this, request, parent, ...args)
}
Module._resolveFilename = function (request, parent, ...args) {
  if (request.startsWith('@/')) {
    request = path.resolve(__dirname, '../src', request.slice(2))
  }
  return originalResolve.call(this, request, parent, ...args)
}

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
      fileName: filename,
    })
    module._compile(outputText, filename)
  }
}
