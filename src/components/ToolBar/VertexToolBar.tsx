'use client'

import { useState } from 'react'
import { useRecoilState, useRecoilValue } from 'recoil'
import { drawingsAtom, modeAtom, selectedDrawingState } from '@/recoil/atoms'
import { selectedVertexIdAtom } from '@/recoil/vertexSelection'
import { Drawing } from '@/types/type'
import {
  convertSplineToPath,
  deleteDrawingVertex,
  setDrawingVertexKind,
  simplifyDrawing,
  splitDrawingSegment,
  straightenDrawingSegment,
  toggleDrawingClosed,
} from '@/utils/pathEditing'

const button =
  'rounded px-2 py-1.5 text-xs hover:bg-gray-500 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap'

/** Context tools reuse the editor's existing compact gray and blue treatment. */
export default function VertexToolBar() {
  const selected = useRecoilValue(selectedDrawingState)
  const mode = useRecoilValue(modeAtom)
  const [, setDrawings] = useRecoilState(drawingsAtom)
  const [selectedVertexId, setSelectedVertexId] = useRecoilState(selectedVertexIdAtom)
  const [tolerance, setTolerance] = useState(2)
  if (
    !selected ||
    selected.hidden ||
    selected.locked ||
    selected.type === 'IMAGE' ||
    selected.type === 'TEXT' ||
    mode.type !== 'SELECT' ||
    mode.subType !== 'VERTEX'
  )
    return null
  const closed = selected.type === 'POLYGON' || selected.type === 'ELLIPSE'
  const index = selected.vertexs.findIndex((vertex) => vertex.id === selectedVertexId)
  const hasVertex = index >= 0
  const hasSegment = hasVertex && (closed || index < selected.vertexs.length - 1)
  const update = (operation: (drawing: Drawing) => Drawing) =>
    setDrawings((drawings) => drawings.map((drawing) => (drawing.id === selected.id ? operation(drawing) : drawing)))
  return (
    <div
      role="toolbar"
      aria-label="Path editing"
      className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-0.5 rounded-lg bg-gray-600 p-1.5 text-white shadow-md"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {selected.type === 'SPLINE' ? (
        <>
          <button type="button" className={button} onClick={() => update(convertSplineToPath)}>
            Edit pencil points
          </button>
          <span className="mx-1 h-4 border-l border-gray-400" />
          <label className="flex items-center gap-1 px-1 text-xs">
            Tolerance{' '}
            <input
              aria-label="Simplification tolerance"
              type="number"
              min="0.1"
              max="50"
              step="0.5"
              value={tolerance}
              onChange={(event) => setTolerance(Math.max(0.1, Math.min(50, Number(event.target.value) || 0.1)))}
              className="w-14 rounded bg-gray-700 px-1 py-1"
            />{' '}
            px
          </label>
          <button
            type="button"
            className={button}
            title="Reduce pencil anchors, then convert to editable curves"
            onClick={() => update((drawing) => simplifyDrawing(drawing, tolerance))}
          >
            Simplify
          </button>
          <span className="px-1 text-xs text-gray-300">{selected.vertexs.length} points</span>
        </>
      ) : (
        <>
          <span className="px-2 text-xs text-blue-200">{hasVertex ? `Point ${index + 1}` : 'Select a point'}</span>
          <button
            type="button"
            className={button}
            disabled={!hasSegment}
            title="Split the following segment without changing its curve"
            onClick={() => update((drawing) => splitDrawingSegment(drawing, selectedVertexId!))}
          >
            Add point
          </button>
          <button
            type="button"
            className={button}
            disabled={!hasVertex || selected.vertexs.length <= (closed ? 3 : 2)}
            onClick={() => {
              update((drawing) => deleteDrawingVertex(drawing, selectedVertexId!))
              setSelectedVertexId(null)
            }}
          >
            Delete point
          </button>
          <span className="mx-1 h-4 border-l border-gray-400" />
          <button
            type="button"
            className={button}
            disabled={!hasVertex}
            onClick={() => update((drawing) => setDrawingVertexKind(drawing, selectedVertexId!, 'smooth'))}
          >
            Smooth
          </button>
          <button
            type="button"
            className={button}
            disabled={!hasVertex}
            onClick={() => update((drawing) => setDrawingVertexKind(drawing, selectedVertexId!, 'corner'))}
          >
            Corner
          </button>
          <button
            type="button"
            className={button}
            disabled={!hasSegment}
            onClick={() => update((drawing) => straightenDrawingSegment(drawing, selectedVertexId!))}
          >
            Straighten
          </button>
          <span className="mx-1 h-4 border-l border-gray-400" />
          <button
            type="button"
            className={button}
            disabled={!closed && selected.vertexs.length < 3}
            onClick={() => update(toggleDrawingClosed)}
          >
            {closed ? 'Open path' : 'Close path'}
          </button>
        </>
      )}
    </div>
  )
}
