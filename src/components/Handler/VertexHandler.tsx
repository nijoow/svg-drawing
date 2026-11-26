import { drawingsAtom } from '@/state/drawing'
import { Drawing, Vertex } from '@/types/type'
import React, { useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { rotateVertex } from '@/utils/rotateVertex'
import usePointDrag from '@/hooks/usePointDrag'

const VertexHandler = ({ drawing: selectedDrawing }: { drawing: Drawing }) => {
  const setDrawings = useSetAtom(drawingsAtom)
  // custom hooks
  const { point, isDragged, onDrag, offDrag, prevRef, setStartPoint, resetPoint } = usePointDrag()

  // useState
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null)

  // uesRef
  const targetHandlerRef = useRef<'VERTEX' | 'CURRENT' | 'NEXT' | null>(null)

  //constant
  const lastIndex = selectedDrawing.vertexs.length - 1
  const selectedVertex = selectedDrawing.vertexs.find((vertex) => vertex.id === selectedVertexId)

  const handlePointerDown = (event: React.PointerEvent, vertex: Vertex) => {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedVertexId(vertex.id)
    prevRef.current.vertexs = selectedDrawing.vertexs
    onDrag()
    setStartPoint(event)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    event.stopPropagation()
    if (!isDragged.current || point.current.startX === undefined || point.current.startY === undefined) return

    const horizontalChange = event.clientX - point.current.startX
    const verticalChange = event.clientY - point.current.startY

    const nextVertexs = prevRef.current.vertexs.map((vertex) => {
      if (vertex.id !== selectedVertexId) return vertex

      const newVertex = { ...vertex }
      switch (targetHandlerRef.current) {
        case 'VERTEX':
          for (const key in vertex) {
            if (key === 'x' || key === 'currentHandlerX' || key === 'nextHandlerX') {
              newVertex[key] = (vertex[key] as number) + horizontalChange
            } else if (key === 'y' || key === 'currentHandlerY' || key === 'nextHandlerY') {
              newVertex[key] = (vertex[key] as number) + verticalChange
            }
          }
          break
        case 'CURRENT':
          newVertex.currentHandlerX = (vertex.currentHandlerX as number) + horizontalChange
          newVertex.currentHandlerY = (vertex.currentHandlerY as number) + verticalChange
          break
        case 'NEXT':
          newVertex.nextHandlerX = (vertex.nextHandlerX as number) + horizontalChange
          newVertex.nextHandlerY = (vertex.nextHandlerY as number) + verticalChange
          break
      }
      return newVertex
    })

    const rotatedVertexMinMax = nextVertexs.reduce(
      (acc, vertex) => {
        const rotatedVertex = rotateVertex(
          vertex.x,
          vertex.y,
          selectedDrawing.center.x,
          selectedDrawing.center.y,
          -selectedDrawing.rotate,
        )
        return {
          ...acc,
          minX: Math.min(acc.minX, rotatedVertex.x),
          minY: Math.min(acc.minY, rotatedVertex.y),
          maxX: Math.max(acc.maxX, rotatedVertex.x),
          maxY: Math.max(acc.maxY, rotatedVertex.y),
        }
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    )

    const rotatedVertexCenter = rotateVertex(
      (rotatedVertexMinMax.maxX + rotatedVertexMinMax.minX) / 2,
      (rotatedVertexMinMax.maxY + rotatedVertexMinMax.minY) / 2,
      0,
      0,
      selectedDrawing.rotate,
    )

    const nextCenterX = rotatedVertexCenter.x + selectedDrawing.center.x
    const nextCenterY = rotatedVertexCenter.y + selectedDrawing.center.y
    const nextWidth = Math.abs(rotatedVertexMinMax.maxX - rotatedVertexMinMax.minX)
    const nextHeight = Math.abs(rotatedVertexMinMax.maxY - rotatedVertexMinMax.minY)

    setDrawings((drawings) =>
      drawings.map((drawing) =>
        drawing.id === selectedDrawing.id
          ? {
              ...drawing,
              width: nextWidth,
              height: nextHeight,
              center: { x: nextCenterX, y: nextCenterY },
              vertexs: nextVertexs,
            }
          : drawing,
      ),
    )
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    event.stopPropagation()
    document.body.style.cursor = 'auto'
    offDrag()
    resetPoint()
  }

  return (
    <>
      <svg
        className="canvas-overlay pointer-events-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
              onPointerDown={(event) => {
                targetHandlerRef.current = 'CURRENT'
                handlePointerDown(event, selectedVertex)
              }}
            />
            <circle
              id={selectedVertex.id}
              cx={selectedVertex.nextHandlerX}
              cy={selectedVertex.nextHandlerY}
              r="5"
              fill={'white'}
              strokeWidth={2}
              className={`stroke-red-400 cursor-pointer pointer-events-auto`}
              onPointerDown={(event) => {
                targetHandlerRef.current = 'NEXT'
                handlePointerDown(event, selectedVertex)
              }}
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
              onPointerDown={(event) => {
                targetHandlerRef.current = 'VERTEX'
                handlePointerDown(event, vertex)
              }}
            />
          ))}
      </svg>
    </>
  )
}

export default VertexHandler
