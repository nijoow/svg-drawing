const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const { createDocument } = require('../src/editor/document.ts')
const { createHistory } = require('../src/editor/history.ts')
const atoms = require('../src/recoil/atoms.ts')

// Exercise the real command dispatcher with a synchronous transaction store.
// Rendering/DOM behavior is covered separately by the browser integration checks.
let activeStore
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (parent?.filename.endsWith('/editor/useEditorActions.ts')) {
    if (request === 'react') return { useMemo: (factory) => factory() }
    if (request === 'recoil')
      return {
        useRecoilTransaction_UNSTABLE: (factory) => {
          const store = activeStore
          return factory({ get: (atom) => store.get(atom), set: (atom, value) => store.set(atom, value) })
        },
      }
  }
  return originalLoad.call(this, request, parent, ...args)
}
let useEditorActions
try {
  ;({ useEditorActions } = require('../src/editor/useEditorActions.ts'))
} finally {
  Module._load = originalLoad
}

const shape = (id) => ({
  id,
  type: 'PATH',
  subType: null,
  width: 20,
  height: 20,
  center: { x: 10, y: 10 },
  rotate: 0,
  fill: 'none',
  stroke: '#000000',
  strokeWidth: 1,
  opacity: 1,
  vertexs: [
    { id: `${id}-1`, type: 'M', x: 0, y: 0 },
    { id: `${id}-2`, type: 'L', x: 20, y: 20 },
  ],
})
const setup = () => {
  const document = { ...createDocument(), drawings: [shape('a')] }
  const store = new Map([
    [atoms.editorHistoryAtom, createHistory(document)],
    [atoms.selectedDrawingIdsAtom, ['a']],
    [atoms.editorErrorState, null],
    [atoms.editorClipboardAtom, null],
    [atoms.modeAtom, { type: 'SELECT', subType: 'SHAPE' }],
  ])
  activeStore = store
  return { store, actions: useEditorActions(), document }
}

test('atomic document insertion selects new IDs only after validation succeeds', () => {
  const { actions, store } = setup()
  actions.updateDocument((document) => ({ ...document, drawings: [...document.drawings, shape('b')] }), ['b'])
  const accepted = store.get(atoms.editorHistoryAtom)
  assert.equal(accepted.past.length, 1)
  assert.deepEqual(store.get(atoms.selectedDrawingIdsAtom), ['b'])
  actions.updateDocument((document) => ({ ...document, drawings: [...document.drawings, shape('b')] }), ['missing'])
  assert.equal(store.get(atoms.editorHistoryAtom), accepted)
  assert.deepEqual(store.get(atoms.selectedDrawingIdsAtom), ['b'])
  assert.ok(store.get(atoms.editorErrorState))
})

test('an asynchronous insertion during a drag commits separately and stale pointer cleanup cannot undo it', () => {
  const { actions, store, document } = setup()
  actions.beginTransaction()
  actions.updateDocument((current) => ({ ...current, name: 'During drag' }))
  assert.equal(store.get(atoms.editorHistoryAtom).past.length, 0)
  actions.updateDocument((current) => ({ ...current, drawings: [...current.drawings, shape('b')] }), ['b'])
  const accepted = store.get(atoms.editorHistoryAtom)
  assert.equal(accepted.transaction, null)
  assert.equal(accepted.past.length, 2)
  actions.cancelTransaction()
  assert.equal(store.get(atoms.editorHistoryAtom), accepted)
  assert.deepEqual(store.get(atoms.selectedDrawingIdsAtom), ['b'])
  actions.undo()
  assert.equal(store.get(atoms.editorHistoryAtom).present.name, 'During drag')
  assert.equal(store.get(atoms.editorHistoryAtom).present.drawings.length, 1)
  actions.undo()
  assert.equal(store.get(atoms.editorHistoryAtom).present, document)
})

test('style updates keep the existing gesture transaction and selection until committed', () => {
  const { actions, store } = setup()
  actions.beginTransaction()
  actions.patchSelection({ opacity: 0.2 })
  actions.patchSelection({ opacity: 0.8 })
  assert.equal(store.get(atoms.editorHistoryAtom).past.length, 0)
  assert.deepEqual(store.get(atoms.selectedDrawingIdsAtom), ['a'])
  actions.endTransaction()
  assert.equal(store.get(atoms.editorHistoryAtom).past.length, 1)
  assert.equal(store.get(atoms.editorHistoryAtom).present.drawings[0].opacity, 0.8)
})

test('clipboard remains shared across hook instances and pastes advance by 24 document pixels', () => {
  const { actions, store } = setup()
  actions.copySelection()
  activeStore = store
  const toolbarActions = useEditorActions()
  toolbarActions.pasteSelection()
  toolbarActions.pasteSelection()
  const history = store.get(atoms.editorHistoryAtom)
  assert.equal(history.past.length, 2)
  assert.deepEqual(
    history.present.drawings.map((drawing) => drawing.center.x),
    [10, 34, 58],
  )
  assert.deepEqual(store.get(atoms.selectedDrawingIdsAtom), [history.present.drawings[2].id])
})
