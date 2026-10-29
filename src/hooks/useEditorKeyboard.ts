'use client'

import { useEffect, useState } from 'react'
import { useRecoilValue } from 'recoil'
import { documentState, historyState, modeAtom, selectedDrawingIdsAtom } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { useViewport } from './useViewport'
import { translateDrawing } from '@/utils/drawingGeometry'
import { getViewBounds } from '@/editor/viewBounds'
import { isTextInput } from '@/editor/keyboard'

export { isTextInput } from '@/editor/keyboard'

export function useEditorKeyboard() {
  const [spacePressed, setSpacePressed] = useState(false)
  const ids = useRecoilValue(selectedDrawingIdsAtom)
  const mode = useRecoilValue(modeAtom)
  const { inTransaction } = useRecoilValue(historyState)
  const document = useRecoilValue(documentState)
  const actions = useEditorActions()
  const { viewport, zoomAt, fitToDrawing } = useViewport()
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || isTextInput(event.target)) return
      const key = event.key.toLowerCase()
      const command = event.ctrlKey || event.metaKey
      if (inTransaction) {
        if (command || event.key.startsWith('Arrow') || ['Delete', 'Backspace', ' '].includes(event.key))
          event.preventDefault()
        return
      }
      if (command) {
        const commands: Record<string, () => void> = {
          a: actions.selectAll,
          c: actions.copySelection,
          x: actions.cutSelection,
          v: actions.pasteSelection,
          d: actions.duplicateSelection,
          g: event.shiftKey ? actions.ungroupSelection : actions.groupSelection,
        }
        if (commands[key]) {
          event.preventDefault()
          commands[key]()
          return
        }
        if (key === '0') {
          event.preventDefault()
          fitToDrawing(getViewBounds(document, ids), window.innerWidth, window.innerHeight)
        }
      }
      if (event.altKey || command) return
      if (event.code === 'Space') {
        event.preventDefault()
        setSpacePressed(true)
        return
      }
      if ((key === 'delete' || key === 'backspace') && mode.type === 'SELECT' && mode.subType !== 'VERTEX') {
        event.preventDefault()
        actions.deleteSelection()
      }
      const delta: Record<string, [number, number]> = {
        arrowleft: [-1, 0],
        arrowright: [1, 0],
        arrowup: [0, -1],
        arrowdown: [0, 1],
      }
      if (delta[key] && ids.length && mode.type === 'SELECT') {
        event.preventDefault()
        const [x, y] = delta[key].map((value) => value * (event.shiftKey ? 10 : 1))
        actions.updateDocument((previous) => ({
          ...previous,
          drawings: previous.drawings.map((drawing) =>
            ids.includes(drawing.id) && !drawing.locked && !drawing.hidden ? translateDrawing(drawing, x, y) : drawing,
          ),
        }))
      }
      if (key === '+' || key === '=' || key === '-') {
        event.preventDefault()
        zoomAt(viewport.zoom * (key === '-' ? 0.8 : 1.25), { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    const blur = () => setSpacePressed(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [actions, document, fitToDrawing, ids, inTransaction, mode, viewport.zoom, zoomAt])
  return spacePressed
}
