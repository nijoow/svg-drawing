'use client'

import { useState } from 'react'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { editorErrorState, historyState, selectedDrawingsState } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { booleanDrawings, replaceBooleanSelection, type BooleanOperation } from '@/vector/boolean'

export default function VectorToolBar() {
  const selected = useRecoilValue(selectedDrawingsState)
  const history = useRecoilValue(historyState)
  const setError = useSetRecoilState(editorErrorState)
  const { updateDocument } = useEditorActions()
  const [pending, setPending] = useState(false)
  if (selected.length < 2) return null

  const combine = async (operation: BooleanOperation) => {
    setPending(true)
    const ids = selected.map((drawing) => drawing.id)
    const snapshot = JSON.stringify(selected)
    try {
      const result = await booleanDrawings(selected, operation)
      updateDocument(
        (document) => {
          const current = document.drawings.filter((drawing) => ids.includes(drawing.id))
          if (JSON.stringify(current) !== snapshot)
            throw new Error('The selected shapes changed. Select them again and retry the shape operation.')
          return { ...document, drawings: replaceBooleanSelection(document.drawings, ids, result) }
        },
        result ? [result.id] : [],
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The selected shapes could not be combined.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Shape operations">
      {(
        [
          ['union', 'Unite', 'Combine selected shapes into one path'],
          ['subtract', 'Subtract', 'Subtract upper shapes from the bottom selected shape'],
          ['intersect', 'Intersect', 'Keep the area shared by every selected shape'],
          ['exclude', 'Exclude', 'Remove overlapping areas from selected shapes'],
        ] as const
      ).map(([operation, label, title]) => (
        <button
          key={operation}
          type="button"
          disabled={pending || history.inTransaction}
          onClick={() => combine(operation)}
          title={title}
          className="rounded px-2 py-1.5 text-xs hover:bg-gray-500 focus-visible:outline focus-visible:outline-sky-300 disabled:opacity-40"
        >
          {pending ? '…' : label}
        </button>
      ))}
    </div>
  )
}
