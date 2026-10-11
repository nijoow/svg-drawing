import { drawingsAtom, gridAtom, selectedDrawingState, snapAtom, viewportAtom } from '@/recoil/atoms'
import { selectedVertexIdAtom, snapGuidesAtom } from '@/recoil/vertexSelection'
import { Vertex } from '@/types/type'
import React, { useEffect } from 'react'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import usePointDrag from '@/hooks/usePointDrag'
import { drawingToPathData } from '@/editor/document'
import { moveDrawingVertex, VertexHandle } from '@/utils/drawingGeometry'
import { snapPoint } from '@/utils/snapping'

const VertexHandler = () => {
  const [drawings, setDrawings] = useRecoilState(drawingsAtom)
  const selectedDrawing = useRecoilValue(selectedDrawingState)
  const [selectedVertexId, setSelectedVertexId] = useRecoilState(selectedVertexIdAtom)
  const viewport = useRecoilValue(viewportAtom)
  const snapping = useRecoilValue(snapAtom)
  const grid = useRecoilValue(gridAtom)
  const setGuides = useSetRecoilState(snapGuidesAtom)
  const { start, pointerHandlers } = usePointDrag<{ vertexId: string; handle: VertexHandle }>(
    selectedDrawing?.hidden || selectedDrawing?.locked ? null : selectedDrawing,
    (drawing, from, to, detail, modifiers) => {
      const vertex = drawing.vertexs.find((item) => item.id === detail.vertexId)
      if (!vertex) return drawing
      const source =
        detail.handle === 'CURRENT'
          ? { x: vertex.currentHandlerX ?? vertex.x, y: vertex.currentHandlerY ?? vertex.y }
          : detail.handle === 'NEXT'
          ? { x: vertex.nextHandlerX ?? vertex.x, y: vertex.nextHandlerY ?? vertex.y }
          : vertex
      let end = { x: source.x + to.x - from.x, y: source.y + to.y - from.y }
      if (modifiers.shift && detail.handle !== 'VERTEX') {
        const angle = (Math.round(Math.atan2(end.y - vertex.y, end.x - vertex.x) / (Math.PI / 4)) * Math.PI) / 4
        const length = Math.hypot(end.x - vertex.x, end.y - vertex.y)
        end = { x: vertex.x + Math.cos(angle) * length, y: vertex.y + Math.sin(angle) * length }
      }
      const snapped =
        snapping && !modifiers.alt && !modifiers.shift
          ? snapPoint(
              end,
              drawings.filter((item) => item.id !== drawing.id),
              viewport.zoom,
              grid,
            )
          : { point: end, guides: [] }
      setGuides(snapped.guides)
      return moveDrawingVertex(
        drawing,
        detail.vertexId,
        detail.handle,
        snapped.point.x - source.x,
        snapped.point.y - source.y,
      )
    },
    (next) => setDrawings((items) => items.map((item) => (item.id === next.id ? next : item))),
    () => setGuides([]),
  )

  useEffect(() => setSelectedVertexId(null), [selectedDrawing?.id, setSelectedVertexId])

  if (
    !selectedDrawing ||
    selectedDrawing.hidden ||
    selectedDrawing.locked ||
    selectedDrawing.type === 'IMAGE' ||
    selectedDrawing.type === 'TEXT'
  )
    return null
  const selectedVertex = selectedDrawing.vertexs.find((vertex) => vertex.id === selectedVertexId)
  const begin = (event: React.PointerEvent<Element>, vertex: Vertex, handle: VertexHandle) => {
    if (event.button !== 0) return
    setSelectedVertexId(vertex.id)
    start(event, { vertexId: vertex.id, handle })
  }
  const size = 5 / viewport.zoom
  const strokeWidth = 1.5 / viewport.zoom

  return (
    <svg
      width="100%"
      height="100%"
      aria-label="Edit object vertices"
      className="absolute top-0 left-0 pointer-events-none overflow-visible"
      {...pointerHandlers}
    >
      <path
        d={drawingToPathData(selectedDrawing)}
        className="stroke-blue-400"
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {selectedVertex &&
        (['CURRENT', 'NEXT'] as const).map((handle) => {
          const x = handle === 'CURRENT' ? selectedVertex.currentHandlerX : selectedVertex.nextHandlerX
          const y = handle === 'CURRENT' ? selectedVertex.currentHandlerY : selectedVertex.nextHandlerY
          if (x === undefined || y === undefined) return null
          return (
            <React.Fragment key={handle}>
              <path
                d={`M ${selectedVertex.x} ${selectedVertex.y} L ${x} ${y}`}
                className="stroke-blue-400"
                fill="none"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={x}
                cy={y}
                r={size}
                fill="white"
                strokeWidth={strokeWidth}
                className="stroke-red-400 cursor-pointer pointer-events-auto touch-none"
                onPointerDown={(event) => begin(event, selectedVertex, handle)}
              >
                <title>{handle === 'CURRENT' ? 'Incoming curve handle' : 'Outgoing curve handle'} (Shift: 45°)</title>
              </circle>
            </React.Fragment>
          )
        })}
      {selectedDrawing.type !== 'SPLINE' &&
        selectedDrawing.vertexs.map((vertex, index) => (
          <circle
            key={vertex.id}
            data-testid={`vertex-${index}`}
            cx={vertex.x}
            cy={vertex.y}
            r={size}
            fill={selectedVertexId === vertex.id ? '#60a5fa' : 'white'}
            strokeWidth={strokeWidth}
            className="cursor-pointer stroke-blue-400 pointer-events-auto touch-none"
            onPointerDown={(event) => begin(event, vertex, 'VERTEX')}
          >
            <title>{`Vertex ${index + 1}`}</title>
          </circle>
        ))}
    </svg>
  )
}

export default VertexHandler
