import { drawingsAtom, gestureAtom } from '@/state/drawing'
import { Drawing, Vertex } from '@/types/type'
import React, { useMemo, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { pathBounds, pathData, pathSegments, segmentData, type Segment } from '@/utils/pathGeometry'
import { nearestParameter, splitSegment } from '@/utils/insertVertex'
import { editableVertices } from '@/utils/getInformationFromSplinePaths'
import { v4 as uuid } from 'uuid'

type Handle = 'CURRENT' | 'NEXT'
function ControlHandle({
  vertex,
  target,
  onDown,
}: {
  vertex: Vertex
  target: Handle
  onDown: (event: React.PointerEvent, vertex: Vertex, target: Handle) => void
}) {
  const x = target === 'CURRENT' ? vertex.currentHandlerX : vertex.nextHandlerX
  const y = target === 'CURRENT' ? vertex.currentHandlerY : vertex.nextHandlerY
  if (x === undefined || y === undefined) return null
  return (
    <g>
      <line x1={vertex.x} y1={vertex.y} x2={x} y2={y} className="stroke-violet-500" />
      <circle
        cx={x}
        cy={y}
        r={5}
        fill="white"
        strokeWidth={2}
        className="stroke-red-400 cursor-pointer pointer-events-auto"
        onPointerDown={(event) => onDown(event, vertex, target)}
      />
    </g>
  )
}

const VertexHandler = ({
  drawing: selectedDrawing,
  inserting,
  finishInsert,
}: {
  drawing: Drawing
  inserting: boolean
  finishInsert: () => void
}) => {
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
  const vertices = useMemo(() => editableVertices(selectedDrawing), [selectedDrawing])
  const polygon = selectedDrawing.type === 'POLYGON'
  const selectedVertex = vertices.find((v) => v.id === selectedVertexId)

  function insert(segment: Segment, t: number) {
    const id = uuid()
    const next = splitSegment(vertices, polygon, segment, t, id)
    if (next === vertices) return
    setDrawings((items) =>
      items.map((item) =>
        item.id === selectedDrawing.id ? { ...item, ...pathBounds(item, next), vertexs: next } : item,
      ),
    )
    setSelectedVertexId(id)
    finishInsert()
  }

  const handlePointerDown = (event: React.PointerEvent, vertex: Vertex, target: 'VERTEX' | 'CURRENT' | 'NEXT') => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedVertexId(vertex.id)
    drag.current = {
      drawing: { ...selectedDrawing, vertexs: vertices },
      vertexId: vertex.id,
      target,
      x: event.clientX,
      y: event.clientY,
    }
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
    gesture((items) =>
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
        <path
          d={pathData(vertices, polygon)}
          className="stroke-violet-500"
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {inserting ? (
          pathSegments(vertices, polygon).map((segment, i) => (
            <path
              key={i}
              d={segmentData(segment)}
              role="button"
              tabIndex={0}
              aria-label={`${i + 1}번째 선분에 점 추가`}
              className="insert-segment"
              fill="none"
              stroke="transparent"
              strokeWidth={24}
              onClick={(event) => insert(segment, nearestParameter(segment, { x: event.clientX, y: event.clientY }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  insert(segment, 0.5)
                }
              }}
            />
          ))
        ) : (
          <>
            {selectedVertex && (
              <>
                <ControlHandle vertex={selectedVertex} target="CURRENT" onDown={handlePointerDown} />
                <ControlHandle vertex={selectedVertex} target="NEXT" onDown={handlePointerDown} />
              </>
            )}
            {vertices.map((vertex) => (
              <circle
                key={vertex.id}
                cx={vertex.x}
                cy={vertex.y}
                r={5}
                fill={vertex.id === selectedVertexId ? 'var(--tint)' : 'white'}
                strokeWidth={2}
                className="vertex-point cursor-pointer pointer-events-auto stroke-violet-500"
                onPointerDown={(event) => handlePointerDown(event, vertex, 'VERTEX')}
              />
            ))}
          </>
        )}
      </svg>
    </>
  )
}

export default VertexHandler
