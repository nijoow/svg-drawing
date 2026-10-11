'use client'

import { useEffect, useRef, useState } from 'react'
import { useRecoilState, useRecoilValue } from 'recoil'
import { v4 as uuid } from 'uuid'
import {
  currentOptionsState,
  documentState,
  drawingsAtom,
  gridAtom,
  historyState,
  modeAtom,
  selectedDrawingIdsAtom,
  selectedDrawingsState,
  snapAtom,
} from '@/recoil/atoms'
import { Drawing, Options, Vertex } from '@/types/type'
import { DrawingContent } from '@/components/Drawings/DrawingNode'
import Handler from '@/components/Handler/Handler'
import MultiSelectionHandler from '@/components/Handler/MultiSelectionHandler'
import VertexHandler from '@/components/Handler/VertexHandler'
import SnapGuides from '@/components/Handler/SnapGuides'
import { createShape, Position, ShapeKind } from '@/drawing/creation'
import { drawingToPathData, getDrawingBounds } from '@/editor/document'
import { selectionForDrawing } from '@/editor/operations'
import { useEditorActions } from '@/editor/useEditorActions'
import { useViewport } from '@/hooks/useViewport'
import { isTextInput } from '@/hooks/useEditorKeyboard'
import { recalculateDrawingBounds } from '@/utils/drawingGeometry'
import { setVertexCurveHandles } from '@/utils/pathEditing'
import { bezierCommand, getSvgInformationFromPath } from '@/utils/getInformationFromSplinePaths'
import { createTextDrawing } from '@/media/text'
import { snapPoint } from '@/utils/snapping'

type Gesture =
  | { kind: 'shape'; pointerId: number; start: Position; shape: ShapeKind; options: Options }
  | { kind: 'pencil'; pointerId: number; points: Vertex[]; options: Options }
  | { kind: 'marquee'; pointerId: number; start: Position; base: string[] }
  | { kind: 'pan'; pointerId: number; start: Position; viewport: Position }
  | { kind: 'pen'; pointerId: number; index: number }

type Props = {
  spacePressed: boolean
  onImportImage: (file: File, point: Position) => Promise<void>
  onEditText: () => void
}

export default function DrawingCanvas({ spacePressed, onImportImage, onEditText }: Props) {
  const [mode, setMode] = useRecoilState(modeAtom)
  const document = useRecoilValue(documentState)
  const options = useRecoilValue(currentOptionsState)
  const [drawings, setDrawings] = useRecoilState(drawingsAtom)
  const ids = useRecoilValue(selectedDrawingIdsAtom)
  const selected = useRecoilValue(selectedDrawingsState)
  const grid = useRecoilValue(gridAtom)
  const snap = useRecoilValue(snapAtom)
  const { inTransaction } = useRecoilValue(historyState)
  const actions = useEditorActions()
  const { viewport, setViewport, screenToDocument, zoomAt } = useViewport()
  const stage = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const penPoints = useRef<Vertex[]>([])
  const [vertices, setVertices] = useState<Vertex[]>([])
  const [spline, setSpline] = useState<Vertex[]>([])
  const [preview, setPreview] = useState<{ start: Position; end: Position; marquee: boolean } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const updatePen = (points: Vertex[]) => {
    penPoints.current = points
    setVertices(points)
  }
  const clearGesture = () => {
    gesture.current = null
    setPreview(null)
    setSpline([])
    setIsPanning(false)
  }
  const append = (drawing: Drawing) => {
    actions.updateDocument((previous) => ({ ...previous, drawings: [...previous.drawings, drawing] }), [drawing.id])
    setMode({ type: 'SELECT', subType: 'SHAPE' })
  }
  const pointAt = (event: { clientX: number; clientY: number; altKey: boolean }, shouldSnap = false) => {
    const point = screenToDocument({ x: event.clientX, y: event.clientY })
    return shouldSnap && snap && !event.altKey ? snapPoint(point, drawings, viewport.zoom, grid).point : point
  }
  const shapeEnd = (start: Position, end: Position, proportional: boolean) => {
    if (!proportional) return end
    const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
    return { x: start.x + Math.sign(end.x - start.x || 1) * size, y: start.y + Math.sign(end.y - start.y || 1) * size }
  }
  const pathDrawing = (points: Vertex[], closed: boolean): Drawing => {
    const contour = points.map((point) => ({ ...point }))
    if (closed) {
      const first = contour[0]
      const last = contour[contour.length - 1]
      const curved = first.currentHandlerX !== undefined || last.nextHandlerX !== undefined
      contour[0] = {
        ...first,
        type: curved ? 'C' : 'L',
        ...(curved
          ? { currentHandlerX: first.currentHandlerX ?? first.x, currentHandlerY: first.currentHandlerY ?? first.y }
          : {}),
      }
      if (curved)
        contour[contour.length - 1] = {
          ...last,
          nextHandlerX: last.nextHandlerX ?? last.x,
          nextHandlerY: last.nextHandlerY ?? last.y,
        }
    }
    return recalculateDrawingBounds({
      id: uuid(),
      type: closed ? 'POLYGON' : 'PATH',
      subType: null,
      vertexs: contour,
      width: 0,
      height: 0,
      center: { x: 0, y: 0 },
      rotate: 0,
      ...options,
    })
  }
  const finishPen = (closed: boolean) => {
    if (penPoints.current.length < (closed ? 3 : 2)) return
    append(pathDrawing(penPoints.current, closed))
    updatePen([])
  }

  useEffect(() => {
    clearGesture()
    updatePen([])
  }, [mode.type, mode.subType, document.id])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        isTextInput(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return
      if (event.key === 'Escape') {
        clearGesture()
        updatePen([])
        actions.setSelection([])
        setMode({ type: 'SELECT', subType: 'SHAPE' })
      }
      if (event.key === 'Enter' && mode.type === 'VERTEX') {
        event.preventDefault()
        finishPen(false)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  })

  useEffect(() => {
    const element = stage.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (gesture.current || inTransaction) return
      if (event.ctrlKey || event.metaKey)
        zoomAt(viewport.zoom * Math.exp(-event.deltaY * 0.002), { x: event.clientX, y: event.clientY })
      else
        setViewport((current) => ({
          ...current,
          x: current.x - (event.shiftKey ? event.deltaY : event.deltaX),
          y: current.y - (event.shiftKey ? event.deltaX : event.deltaY),
        }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [inTransaction, setViewport, viewport.zoom, zoomAt])

  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    if (gesture.current?.kind === 'pan') return
    const start = pointAt(event, mode.type === 'SHAPE' || mode.type === 'VERTEX')
    if (mode.type === 'SELECT') {
      const element = event.target instanceof Element ? event.target.closest('[data-drawing-id]') : null
      const id = element?.getAttribute('data-drawing-id')
      if (id) {
        const clicked = selectionForDrawing(document, id, event.altKey)
        actions.setSelection(
          event.shiftKey
            ? clicked.every((value) => ids.includes(value))
              ? ids.filter((value) => !clicked.includes(value))
              : [...ids, ...clicked]
            : clicked,
        )
        return
      }
      gesture.current = { kind: 'marquee', pointerId: event.pointerId, start, base: event.shiftKey ? ids : [] }
      if (!event.shiftKey) actions.setSelection([])
      setPreview({ start, end: start, marquee: true })
    } else if (mode.type === 'SHAPE' && ['RECTANGLE', 'ELLIPSE', 'TRIANGLE'].includes(mode.subType ?? '')) {
      gesture.current = { kind: 'shape', pointerId: event.pointerId, start, shape: mode.subType as ShapeKind, options }
      actions.setSelection([])
      setPreview({ start, end: start, marquee: false })
    } else if (mode.type === 'PENCIL') {
      const points: Vertex[] = [{ id: uuid(), type: null, ...start }]
      gesture.current = { kind: 'pencil', pointerId: event.pointerId, points, options }
      actions.setSelection([])
      setSpline(points)
    } else if (mode.type === 'VERTEX') {
      const previous = penPoints.current
      if (previous.length >= 3 && Math.hypot(start.x - previous[0].x, start.y - previous[0].y) * viewport.zoom < 10) {
        finishPen(true)
        return
      }
      const last = previous[previous.length - 1]
      const curved = last?.nextHandlerX !== undefined
      const point: Vertex = {
        id: uuid(),
        ...start,
        type: !previous.length ? 'M' : curved ? 'C' : 'L',
        ...(curved ? { currentHandlerX: start.x, currentHandlerY: start.y } : {}),
      }
      updatePen([...previous, point])
      gesture.current = { kind: 'pen', pointerId: event.pointerId, index: previous.length }
      actions.setSelection([])
    } else if (mode.type === 'TEXT') {
      append(
        createTextDrawing(start, {
          ...options,
          fill: ['none', 'transparent'].includes(options.fill) ? '#1f2937' : options.fill,
          stroke: 'none',
          strokeWidth: 0,
        }),
      )
      onEditText()
      return
    } else return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === 'pan') {
      setViewport((current) => ({
        ...current,
        x: active.viewport.x + event.clientX - active.start.x,
        y: active.viewport.y + event.clientY - active.start.y,
      }))
      return
    }
    const point = pointAt(event, active.kind === 'shape')
    if (active.kind === 'shape' || active.kind === 'marquee') {
      const end = active.kind === 'shape' ? shapeEnd(active.start, point, event.shiftKey) : point
      setPreview({ start: active.start, end, marquee: active.kind === 'marquee' })
    }
    if (active.kind === 'pencil' && active.points.length < 20000) {
      const last = active.points[active.points.length - 1]
      if (Math.hypot(point.x - last.x, point.y - last.y) * viewport.zoom >= 1) {
        active.points.push({ id: uuid(), type: null, ...point })
        setSpline([...active.points])
      }
    }
    if (active.kind === 'pen') {
      const points = penPoints.current.map((vertex) => ({ ...vertex }))
      const anchor = points[active.index]
      if (Math.hypot(point.x - anchor.x, point.y - anchor.y) * viewport.zoom < 2) return
      points[active.index] = { ...setVertexCurveHandles(anchor, point), type: active.index ? 'C' : 'M' }
      if (active.index) {
        const previous = points[active.index - 1]
        points[active.index - 1] = {
          ...previous,
          nextHandlerX: previous.nextHandlerX ?? previous.x,
          nextHandlerY: previous.nextHandlerY ?? previous.y,
        }
      }
      updatePen(points)
    }
  }

  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === 'shape') {
      const result = createShape(
        active.shape,
        active.start,
        shapeEnd(active.start, pointAt(event, true), event.shiftKey),
        active.options,
      )
      if (result) append(result)
    }
    if (active.kind === 'pencil') {
      move(event)
      if (active.points.length >= 2)
        setDrawings((previous) => [
          ...previous,
          {
            id: uuid(),
            type: 'SPLINE',
            subType: null,
            vertexs: active.points,
            ...getSvgInformationFromPath(active.points),
            rotate: 0,
            ...active.options,
            fill: 'none',
          },
        ])
    }
    if (active.kind === 'marquee') {
      const end = pointAt(event)
      if (Math.hypot(end.x - active.start.x, end.y - active.start.y) * viewport.zoom > 3) {
        const minX = Math.min(active.start.x, end.x),
          maxX = Math.max(active.start.x, end.x)
        const minY = Math.min(active.start.y, end.y),
          maxY = Math.max(active.start.y, end.y)
        const hit = drawings
          .filter((drawing) => {
            if (drawing.locked || drawing.hidden) return false
            const bounds = getDrawingBounds(drawing)
            return bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxY >= minY && bounds.minY <= maxY
          })
          .flatMap((drawing) => selectionForDrawing(document, drawing.id, event.altKey))
        actions.setSelection([...active.base, ...hit])
      }
    }
    clearGesture()
  }

  const penPath = vertices.length ? drawingToPathData(pathDrawing(vertices, false)) : ''
  const panning = spacePressed || mode.type === 'HAND'
  return (
    <div
      ref={stage}
      data-testid="drawing-surface"
      className={`absolute inset-0 touch-none overflow-hidden ${
        isPanning ? 'cursor-grabbing' : panning ? 'cursor-grab' : mode.type === 'SELECT' ? '' : 'cursor-crosshair'
      }`}
      style={
        grid
          ? {
              backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
              backgroundSize: `${Math.max(5, 10 * viewport.zoom)}px ${Math.max(5, 10 * viewport.zoom)}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }
          : undefined
      }
      onPointerDownCapture={(event) => {
        if ((panning && event.button === 0) || event.button === 1) {
          event.preventDefault()
          event.stopPropagation()
          gesture.current = {
            kind: 'pan',
            pointerId: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            viewport,
          }
          setIsPanning(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={clearGesture}
      onLostPointerCapture={clearGesture}
      onContextMenu={(event) => {
        if (mode.type === 'VERTEX') {
          event.preventDefault()
          updatePen([])
          setMode({ type: 'SELECT', subType: 'SHAPE' })
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (file) void onImportImage(file, pointAt(event))
      }}
      onDoubleClick={(event) => {
        const id =
          event.target instanceof Element
            ? event.target.closest('[data-drawing-id]')?.getAttribute('data-drawing-id')
            : null
        if (drawings.some((drawing) => drawing.id === id && drawing.type === 'TEXT' && !drawing.locked)) {
          actions.setSelection([id!])
          onEditText()
        }
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          width: document.canvas.width,
          height: document.canvas.height,
          pointerEvents: 'none',
        }}
      >
        <svg
          width={document.canvas.width}
          height={document.canvas.height}
          overflow="visible"
          className="absolute pointer-events-none"
          style={{ isolation: 'isolate' }}
          aria-label="Artwork"
        >
          {document.artboards.map((board) => (
            <g key={board.id} pointerEvents="none">
              <rect
                x={board.x}
                y={board.y}
                width={board.width}
                height={board.height}
                fill="white"
                stroke="#cbd5e1"
                strokeWidth={1 / viewport.zoom}
              />
              <text x={board.x} y={board.y - 8 / viewport.zoom} fontSize={12 / viewport.zoom} fill="#64748b">
                {board.name}
              </text>
            </g>
          ))}
          {drawings.map((drawing) => (
            <DrawingContent key={drawing.id} drawing={drawing} />
          ))}
          {preview && (
            <rect
              x={Math.min(preview.start.x, preview.end.x)}
              y={Math.min(preview.start.y, preview.end.y)}
              width={Math.abs(preview.end.x - preview.start.x)}
              height={Math.abs(preview.end.y - preview.start.y)}
              fill="#4ea1d3"
              fillOpacity={0.07}
              stroke="#4ea1d3"
              strokeWidth={1 / viewport.zoom}
              strokeDasharray={preview.marquee ? `${4 / viewport.zoom}` : undefined}
            />
          )}
          {spline.length > 0 && (
            <path
              d={spline.reduce(
                (path, point, index, points) =>
                  index ? `${path} ${bezierCommand(point, index, points)}` : `M ${point.x},${point.y}`,
                '',
              )}
              fill="none"
              stroke={options.stroke}
              strokeWidth={options.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {vertices.length > 0 && (
            <g>
              <path d={penPath} fill="none" stroke="#4ea1d3" strokeWidth={2 / viewport.zoom} />
              {vertices.map((vertex, index) => (
                <g key={vertex.id}>
                  {vertex.currentHandlerX !== undefined && (
                    <>
                      <path
                        d={`M ${vertex.currentHandlerX} ${vertex.currentHandlerY} L ${vertex.nextHandlerX} ${vertex.nextHandlerY}`}
                        stroke="#94a3b8"
                        strokeWidth={1 / viewport.zoom}
                      />
                      <circle cx={vertex.nextHandlerX} cy={vertex.nextHandlerY} r={3 / viewport.zoom} fill="#4ea1d3" />
                    </>
                  )}
                  <circle
                    cx={vertex.x}
                    cy={vertex.y}
                    r={5 / viewport.zoom}
                    fill="white"
                    stroke={index ? '#4ea1d3' : '#e85a71'}
                    strokeWidth={2 / viewport.zoom}
                  />
                </g>
              ))}
            </g>
          )}
        </svg>
        {mode.type === 'SELECT' &&
          selected.length === 1 &&
          (mode.subType === 'VERTEX' && !['TEXT', 'IMAGE'].includes(selected[0].type) ? (
            <VertexHandler />
          ) : (
            <Handler />
          ))}
        {mode.type === 'SELECT' && selected.length > 1 && <MultiSelectionHandler />}
        <SnapGuides />
      </div>
      {mode.type === 'VERTEX' && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-3 py-2 text-xs text-slate-500">
          Click points · Drag curves · Enter finish · First point close
        </div>
      )}
    </div>
  )
}
