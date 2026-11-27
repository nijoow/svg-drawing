import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { FiRotateCcw, FiRotateCw } from 'react-icons/fi'
import { canRedoAtom, canUndoAtom, historyAtom } from '@/state/drawing'

export default function HistoryControls() {
  const canUndo = useAtomValue(canUndoAtom)
  const canRedo = useAtomValue(canRedoAtom)
  const history = useSetAtom(historyAtom)
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        !(event.code === 'KeyZ' || event.key.toLowerCase() === 'z') ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable || event.target.closest('input, textarea, select')))
      )
        return
      if (event.shiftKey ? !canRedo : !canUndo) return
      event.preventDefault()
      history(event.shiftKey ? 'redo' : 'undo')
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canUndo, canRedo, history])

  return (
    <div role="group" aria-label="편집 기록" className="history-controls">
      <button
        className="tool-button"
        type="button"
        disabled={!canUndo}
        onClick={() => history('undo')}
        title="실행 취소 (Ctrl/⌘+Z)"
      >
        <FiRotateCcw aria-hidden="true" />
        실행 취소
      </button>
      <button
        className="tool-button"
        type="button"
        disabled={!canRedo}
        onClick={() => history('redo')}
        title="다시 실행 (Ctrl/⌘+Shift+Z)"
      >
        <FiRotateCw aria-hidden="true" />
        다시 실행
      </button>
    </div>
  )
}
