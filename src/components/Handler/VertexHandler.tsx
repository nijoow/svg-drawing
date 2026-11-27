import { drawingsAtom, gestureAtom } from '@/state/drawing'
import { Drawing, Vertex } from '@/types/type'
import React, { useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { pathBounds } from '@/utils/pathGeometry'

const VertexHandler = ({ drawing: selectedDrawing }: { drawing: Drawing }) => {
  const gesture = useSetAtom(gestureAtom)
  const setDrawings = useSetAtom(drawingsAtom)
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null)
  const drag = useRef<{
    drawing: Drawing
    vertexId: string
    target: 'VERTEX' | 'CURRENT' | 'NEXT'
    x: number
    y: number
  } | null>(null)
  const lastIndex = selectedDrawing.vertexs.length - 1
  const selectedVertex = selectedDrawing.vertexs.find((vertex) => vertex.id === selectedVertexId)

  const handlePointerDown = (event: React.PointerEvent, vertex: Vertex, target: 'VERTEX' | 'CURRENT' | 'NEXT') => {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedVertexId(vertex.id)
    drag.current = { drawing: selectedDrawing, vertexId: vertex.id, target, x: event.clientX, y: event.clientY }
    gesture('begin')
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    if (!event.isPrimary || !start) return
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y
    const vertices = start.drawing.vertexs.map((vertex) => {
      if (vertex.id !== start.vertexId) return vertex
      const next = { ...vertex }
      if (start.target === 'VERTEX') {
        next.x += dx
        next.y += dy
      }
      if (start.target !== 'NEXT' && next.currentHandlerX !== undefined && next.currentHandlerY !== undefined) {
        next.currentHandlerX += dx
        next.currentHandlerY += dy
      }
      if (start.target !== 'CURRENT' && next.nextHandlerX !== undefined && next.nextHandlerY !== undefined) {
        next.nextHandlerX += dx
        next.nextHandlerY += dy
      }
      return next
    })
    const bounds = pathBounds(start.drawing, vertices)
    setDrawings((items) =>
      items.map((item) => (item.id === start.drawing.id ? { ...item, ...bounds, vertexs: vertices } : item)),
    )
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!event.isPrimary || !drag.current) return
    drag.current = null
    gesture(event.type === 'pointerup' ? 'finish' : 'cancel')
  }

  return (
    <>
      <svg
        className="canvas-overlay pointer-events-none"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        {selectedDrawing.vertexs.length > 1 && (
          <path
            d={
              `M ${selectedDrawing.vertexs[lastIndex].x} ${selectedDrawing.vertexs[lastIndex].y}` +
              selectedDrawing.vertexs
                .map((vertex, index, vertexs) => {
                  const prevVertex = index === 0 ? selectedDrawing.vertexs[vertexs.length - 1] : vertexs[index - 1]
                  return {
                    M: `M ${vertex.x} ${vertex.y}`,
                    L: `L ${vertex.x} ${vertex.y}`,
                    C: `C ${prevVertex.nextHandlerX} ${prevVertex.nextHandlerY}, ${vertex.currentHandlerX} ${vertex.currentHandlerY}, ${vertex.x} ${vertex.y}`,
                    S: `S ${vertex.currentHandlerX} ${vertex.currentHandlerY}, ${vertex.x} ${vertex.y}`,
                  }[vertex.type!]
                })
                .join(' ') +
              (selectedDrawing.type === 'POLYGON' ? ' Z' : '')
            }
            className="stroke-violet-500"
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {selectedVertex?.type === 'C' && (
          <>
            <path
              d={`M ${selectedVertex.x} ${selectedVertex.y} L ${selectedVertex.currentHandlerX} ${selectedVertex.currentHandlerY}`}
              className="stroke-violet-500"
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <path
              d={`M ${selectedVertex.x} ${selectedVertex.y} L ${selectedVertex.nextHandlerX} ${selectedVertex.nextHandlerY}`}
              className="stroke-violet-500"
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <circle
              id={selectedVertex.id}
              cx={selectedVertex.currentHandlerX}
              cy={selectedVertex.currentHandlerY}
              r="5"
              fill={'white'}
              strokeWidth={2}
              className={`stroke-red-400 cursor-pointer pointer-events-auto`}
              onPointerDown={(event) => handlePointerDown(event, selectedVertex, 'CURRENT')}
            />
            <circle
              id={selectedVertex.id}
              cx={selectedVertex.nextHandlerX}
              cy={selectedVertex.nextHandlerY}
              r="5"
              fill={'white'}
              strokeWidth={2}
              className={`stroke-red-400 cursor-pointer pointer-events-auto`}
              onPointerDown={(event) => handlePointerDown(event, selectedVertex, 'NEXT')}
            />
          </>
        )}
        {selectedDrawing.type !== 'SPLINE' &&
          selectedDrawing.vertexs.map((vertex: Vertex) => (
            <circle
              key={vertex.id}
              id={vertex.id}
              cx={vertex.x}
              cy={vertex.y}
              r="5"
              fill={'white'}
              strokeWidth={2}
              className={`cursor-pointer pointer-events-auto stroke-violet-500`}
              onPointerDown={(event) => handlePointerDown(event, vertex, 'VERTEX')}
            />
          ))}
      </svg>
    </>
  )
}

export default VertexHandler
