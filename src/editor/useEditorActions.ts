'use client'

import { useMemo } from 'react'
import { useRecoilTransaction_UNSTABLE } from 'recoil'
import {
  editorClipboardAtom,
  editorErrorState,
  editorHistoryAtom,
  modeAtom,
  selectedDrawingIdsAtom,
} from '@/recoil/atoms'
import type { Drawing } from '@/types/type'
import { normalizeDocumentName, type EditorDocument } from './document'
import { applyHistoryAction, type HistoryAction } from './history'
import {
  alignSelection,
  copySelection,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  expandSelection,
  groupSelection,
  pasteSelection,
  patchSelection,
  ungroupSelection,
  type Alignment,
  type Distribution,
  type SelectionEdit,
} from './operations'

type EditorCommand =
  | HistoryAction
  | { type: 'rename'; name: string }
  | { type: 'update'; updater: (document: EditorDocument) => EditorDocument; selection?: string[] }
  | { type: 'selection'; ids: string[] }
  | { type: 'edit'; edit: (document: EditorDocument, selection: string[]) => SelectionEdit }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'selectAll' }

export function useEditorActions() {
  const dispatch = useRecoilTransaction_UNSTABLE(
    ({ get, set }) =>
      (action: EditorCommand) => {
        let history = get(editorHistoryAtom)
        // Pointer cleanup may run after another command has already committed
        // the gesture. It must not clear the new command's accepted selection.
        if (action.type === 'cancel' && !history.transaction) return
        if (action.type === 'update' && action.selection !== undefined && history.transaction) {
          // Imports can finish asynchronously while a drag is active. An edit
          // that chooses a new selection is a separate completed command.
          const committed = applyHistoryAction(history, { type: 'end' })
          if (committed.error) {
            set(editorHistoryAtom, committed.history)
            set(editorErrorState, committed.error)
            return
          }
          history = committed.history
        }
        const selection = get(selectedDrawingIdsAtom)
        if (action.type === 'selection' || action.type === 'selectAll') {
          set(
            selectedDrawingIdsAtom,
            expandSelection(
              history.present,
              action.type === 'selection' ? action.ids : history.present.drawings.map((d) => d.id),
            ),
          )
          return
        }
        if (action.type === 'copy' || action.type === 'cut') {
          const content = copySelection(history.present, selection)
          if (!content) return
          set(editorClipboardAtom, { content, pasteCount: 0 })
          if (action.type === 'copy') return
        }
        let nextSelection: string[] | undefined
        let command: HistoryAction
        let pasted = false
        try {
          switch (action.type) {
            case 'rename':
              command = { type: 'change', document: { ...history.present, name: normalizeDocumentName(action.name) } }
              break
            case 'update':
              command = { type: 'change', document: action.updater(history.present) }
              nextSelection = action.selection
              break
            case 'edit': {
              const edited = action.edit(history.present, selection)
              command = { type: 'change', document: edited.document }
              nextSelection = edited.selection
              break
            }
            case 'cut': {
              const edited = deleteSelection(history.present, selection)
              command = { type: 'change', document: edited.document }
              nextSelection = edited.selection
              break
            }
            case 'paste': {
              const clipboard = get(editorClipboardAtom)
              if (!clipboard) return
              const edited = pasteSelection(history.present, clipboard.content, (clipboard.pasteCount + 1) * 24)
              command = { type: 'change', document: edited.document }
              nextSelection = edited.selection
              pasted = true
              break
            }
            default:
              command = action
          }
        } catch (error) {
          set(editorErrorState, error instanceof Error ? error.message : 'The edit could not be applied.')
          return
        }
        const result = applyHistoryAction(history, command)
        set(editorHistoryAtom, result.history)
        if (result.error) {
          set(editorErrorState, result.error)
          return
        }
        if (pasted) {
          const clipboard = get(editorClipboardAtom)
          if (clipboard) set(editorClipboardAtom, { ...clipboard, pasteCount: clipboard.pasteCount + 1 })
        }
        if (['replace', 'undo', 'redo', 'cancel'].includes(command.type)) {
          set(selectedDrawingIdsAtom, [])
          set(modeAtom, { type: 'SELECT', subType: 'SHAPE' })
        } else {
          set(selectedDrawingIdsAtom, expandSelection(result.history.present, nextSelection ?? selection))
          if (pasted) set(modeAtom, { type: 'SELECT', subType: 'SHAPE' })
        }
      },
    [],
  )

  return useMemo(
    () => ({
      beginTransaction: () => dispatch({ type: 'begin' }),
      endTransaction: () => dispatch({ type: 'end' }),
      cancelTransaction: () => dispatch({ type: 'cancel' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      replaceDocument: (document: EditorDocument) => dispatch({ type: 'replace', document }),
      renameDocument: (name: string) => dispatch({ type: 'rename', name }),
      updateDocument: (updater: (document: EditorDocument) => EditorDocument, nextSelection?: string[]) =>
        dispatch({ type: 'update', updater, selection: nextSelection }),
      setSelection: (ids: string[]) => dispatch({ type: 'selection', ids }),
      selectAll: () => dispatch({ type: 'selectAll' }),
      deleteSelection: () => dispatch({ type: 'edit', edit: deleteSelection }),
      duplicateSelection: () => dispatch({ type: 'edit', edit: duplicateSelection }),
      copySelection: () => dispatch({ type: 'copy' }),
      cutSelection: () => dispatch({ type: 'cut' }),
      pasteSelection: () => dispatch({ type: 'paste' }),
      groupSelection: () => dispatch({ type: 'edit', edit: groupSelection }),
      ungroupSelection: () => dispatch({ type: 'edit', edit: ungroupSelection }),
      alignSelection: (alignment: Alignment) =>
        dispatch({
          type: 'edit',
          edit: (document, selection) => ({ document: alignSelection(document, selection, alignment), selection }),
        }),
      distributeSelection: (direction: Distribution) =>
        dispatch({
          type: 'edit',
          edit: (document, selection) => ({ document: distributeSelection(document, selection, direction), selection }),
        }),
      patchSelection: (patch: Partial<Drawing>) =>
        dispatch({
          type: 'edit',
          edit: (document, selection) => ({ document: patchSelection(document, selection, patch), selection }),
        }),
    }),
    [dispatch],
  )
}
