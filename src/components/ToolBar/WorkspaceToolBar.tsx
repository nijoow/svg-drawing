'use client'

import { useEffect, useRef, useState } from 'react'
import { useRecoilValue } from 'recoil'
import { IoChevronUp, IoCopyOutline, IoDuplicateOutline, IoTrashOutline } from 'react-icons/io5'
import { editorClipboardAtom, selectedDrawingsState } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { reorderDocumentSelection } from '@/editor/panelCommands'
import { panelButton } from '@/components/Panels/PanelFields'

export default function WorkspaceToolBar() {
  const selected = useRecoilValue(selectedDrawingsState)
  const clipboard = useRecoilValue(editorClipboardAtom)
  const actions = useEditorActions()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (!event.isComposing && event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', escape)
    }
  }, [])
  const ids = selected.map(({ id }) => id)
  const arrange = (callback: () => void) => {
    callback()
    setOpen(false)
  }
  return (
    <div
      ref={root}
      className="fixed bottom-4 left-1/2 z-20 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-xl bg-gray-600 p-1.5 text-white shadow-lg"
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="hidden min-w-fit px-2 text-xs text-gray-200 sm:block">
        {selected.length ? `${selected.length} selected` : 'Ready to create'}
      </span>
      <button
        type="button"
        title="Copy (Ctrl/⌘ C)"
        aria-label="Copy selection"
        className={panelButton}
        disabled={!selected.length}
        onClick={actions.copySelection}
      >
        <IoCopyOutline size={17} />
      </button>
      <button
        type="button"
        title="Paste (Ctrl/⌘ V)"
        className={panelButton}
        disabled={!clipboard}
        onClick={actions.pasteSelection}
      >
        Paste
      </button>
      <button
        type="button"
        title="Duplicate (Ctrl/⌘ D)"
        aria-label="Duplicate selection"
        className={panelButton}
        disabled={!selected.length}
        onClick={actions.duplicateSelection}
      >
        <IoDuplicateOutline size={17} />
      </button>
      <div className="relative">
        <button
          type="button"
          className={`${panelButton} flex items-center gap-1.5`}
          aria-expanded={open}
          aria-controls="arrange-menu"
          onClick={() => setOpen(!open)}
        >
          Arrange
          <IoChevronUp size={12} />
        </button>
        {open && (
          <div
            id="arrange-menu"
            className="absolute bottom-full right-0 mb-3 w-64 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-gray-500 bg-gray-600 p-3 text-xs shadow-xl"
            aria-label="Arrange selection"
          >
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={panelButton}
                disabled={selected.length < 2}
                onClick={() => arrange(actions.groupSelection)}
              >
                Group
              </button>
              <button
                type="button"
                className={panelButton}
                disabled={!selected.some((drawing) => drawing.groupId)}
                onClick={() => arrange(actions.ungroupSelection)}
              >
                Ungroup
              </button>
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-200">Align selection</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((alignment) => (
                  <button
                    key={alignment}
                    type="button"
                    className={panelButton}
                    disabled={selected.length < 2}
                    onClick={() => arrange(() => actions.alignSelection(alignment))}
                  >
                    {alignment.charAt(0).toUpperCase() + alignment.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-200">Distribute spacing</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className={panelButton}
                  disabled={selected.length < 3}
                  onClick={() => arrange(() => actions.distributeSelection('horizontal'))}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  className={panelButton}
                  disabled={selected.length < 3}
                  onClick={() => arrange(() => actions.distributeSelection('vertical'))}
                >
                  Vertical
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 border-t border-gray-500 pt-3">
              <button
                type="button"
                className={panelButton}
                disabled={!selected.length}
                onClick={() =>
                  arrange(() => actions.updateDocument((current) => reorderDocumentSelection(current, ids, 'up')))
                }
              >
                Raise layers
              </button>
              <button
                type="button"
                className={panelButton}
                disabled={!selected.length}
                onClick={() =>
                  arrange(() => actions.updateDocument((current) => reorderDocumentSelection(current, ids, 'down')))
                }
              >
                Lower layers
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={panelButton} onClick={() => arrange(actions.selectAll)}>
                Select all
              </button>
              <button
                type="button"
                className={panelButton}
                disabled={!selected.length}
                onClick={() => arrange(actions.cutSelection)}
              >
                Cut
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        title="Delete selection"
        aria-label="Delete selection"
        className={panelButton}
        disabled={!selected.length}
        onClick={actions.deleteSelection}
      >
        <IoTrashOutline size={17} />
      </button>
    </div>
  )
}
