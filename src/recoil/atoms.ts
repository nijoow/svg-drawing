import { Drawing, Mode, Options } from '@/types/type'
import { atom, DefaultValue, selector } from 'recoil'
import { createDocument } from '@/editor/document'
import { applyHistoryAction, createHistory } from '@/editor/history'
import { expandSelection, type ClipboardContent } from '@/editor/operations'

export const modeAtom = atom<Mode>({
  key: 'Mode',
  default: { type: 'SELECT', subType: null },
})

export const currentOptionsState = selector({
  key: 'CurrentOptions',
  get: ({ get }) => {
    const selectedDrawing = get(selectedDrawingsState)[0]

    return selectedDrawing
      ? {
          fill: selectedDrawing.fill,
          stroke: selectedDrawing.stroke,
          strokeWidth: selectedDrawing.strokeWidth,
          opacity: selectedDrawing.opacity,
        }
      : get(basicOptionsAtom)
  },
})

export const basicOptionsAtom = atom<Options>({
  key: 'BasicOptions',
  default: { fill: '#000000', stroke: '#000000', strokeWidth: 1, opacity: 1 },
})

export const selectedDrawingIdsAtom = atom<string[]>({
  key: 'SelectedDrawingIds',
  default: [],
})

// Single-object tools retain their existing API, without accidentally editing
// one arbitrary member of a multiple-object selection.
export const selectedDrawingIdAtom = selector<string | null>({
  key: 'SelectedDrawingId',
  get: ({ get }) => {
    const ids = get(selectedDrawingIdsAtom)
    return ids.length === 1 ? ids[0] : null
  },
  set: ({ get, set }, value) => {
    const ids = value instanceof DefaultValue || value === null ? [] : [value]
    set(selectedDrawingIdsAtom, expandSelection(get(documentState), ids))
  },
})

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export const viewportAtom = atom<Viewport>({
  key: 'Viewport',
  default: { x: 0, y: 0, zoom: 1 },
})

export const snapAtom = atom<boolean>({ key: 'Snap', default: true })
export const gridAtom = atom<boolean>({ key: 'Grid', default: false })

// Clipboard belongs to this editor root and is shared by every toolbar/hotkey hook.
export const editorClipboardAtom = atom<{ content: ClipboardContent; pasteCount: number } | null>({
  key: 'EditorClipboard',
  default: null,
})

export const editorHistoryAtom = atom({
  key: 'EditorHistory',
  default: createHistory(createDocument()),
})

export const editorErrorState = atom<string | null>({
  key: 'EditorError',
  default: null,
})

export const documentState = selector({
  key: 'EditorDocument',
  get: ({ get }) => get(editorHistoryAtom).present,
})

export const historyState = selector({
  key: 'EditorHistoryStatus',
  get: ({ get }) => {
    const history = get(editorHistoryAtom)
    return {
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      inTransaction: history.transaction !== null,
    }
  },
})

// Keep the existing drawing API while routing every edit through document history.
export const drawingsAtom = selector<Drawing[]>({
  key: 'Drawings',
  get: ({ get }) => get(documentState).drawings,
  set: ({ get, set }, value) => {
    const history = get(editorHistoryAtom)
    const drawings = value instanceof DefaultValue ? [] : value
    if (drawings === history.present.drawings) return
    const result = applyHistoryAction(history, { type: 'change', document: { ...history.present, drawings } })
    set(editorHistoryAtom, result.history)
    if (result.error) set(editorErrorState, result.error)
    if (!result.error) set(selectedDrawingIdsAtom, expandSelection(result.history.present, get(selectedDrawingIdsAtom)))
  },
})

export const selectedDrawingsState = selector<Drawing[]>({
  key: 'SelectedDrawings',
  get: ({ get }) => {
    const document = get(documentState)
    const ids = new Set(expandSelection(document, get(selectedDrawingIdsAtom)))
    return document.drawings.filter((drawing) => ids.has(drawing.id))
  },
})

export const selectedDrawingState = selector({
  key: 'SelectedDrawing',
  get: ({ get }) => {
    const drawings = get(selectedDrawingsState)
    return drawings.length === 1 ? drawings[0] : null
  },
})

export const recentColorsAtom = atom<string[]>({
  key: 'RecentColors',
  default: [],
})
