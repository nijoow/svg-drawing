import { PointerEvent } from 'react'
import { useRecoilValue } from 'recoil'
import { documentState, selectedDrawingIdsAtom } from '@/recoil/atoms'
import { selectionForDrawing } from '@/editor/operations'
import { useEditorActions } from '@/editor/useEditorActions'

/** Selection boxes must not swallow Shift-clicks on artwork behind them. */
export function useOverlaySelection() {
  const editorDocument = useRecoilValue(documentState)
  const selected = useRecoilValue(selectedDrawingIdsAtom)
  const { setSelection } = useEditorActions()
  return (event: PointerEvent<Element>): boolean => {
    if (!event.shiftKey) return false
    const hit = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest('[data-drawing-id]')?.getAttribute('data-drawing-id'))
      .find(
        (id) =>
          id && editorDocument.drawings.some((drawing) => drawing.id === id && !drawing.hidden && !drawing.locked),
      )
    if (!hit) return false
    const clicked = selectionForDrawing(editorDocument, hit, event.altKey)
    setSelection(
      clicked.every((id) => selected.includes(id))
        ? selected.filter((id) => !clicked.includes(id))
        : [...selected, ...clicked],
    )
    event.stopPropagation()
    event.preventDefault()
    return true
  }
}
