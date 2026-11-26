'use client'

import { IoShapesOutline } from 'react-icons/io5'
import { FiPlus } from 'react-icons/fi'
import React, { useCallback, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  currentOptionsState,
  drawingsAtom,
  modeAtom,
  selectedDrawingIdAtom,
  selectedDrawingState,
} from '@/state/drawing'
import SideToolBar from '@/components/ToolBar/SideToolBar'
import { Drawing, DrawingType, Mode, Point, Vertex } from '@/types/type'
import { v4 as uuid } from 'uuid'
import { getHeightFromPoint, getLeftFromPoint, getTopFromPoint, getWidthFromPoint } from '@/utils/getValueFromPoint'
import TopToolBar from '@/components/ToolBar/TopToolBar'
import { DrawingMenu } from '@/components/ToolBar/DrawingActions'
import { translateDrawing } from '@/utils/translateDrawing'
import Handler from '@/components/Handler/Handler'
import { getInformationFromVertexs } from '@/utils/getInformationFromVertex'
import Path from '@/components/Drawings/Path'
import VertexHandler from '@/components/Handler/VertexHandler'
import { bezierCommand, getSvgInformationFromPath } from '@/utils/getInformationFromSplinePaths'
import Spline from '@/components/Drawings/Spline'

const defaultPoint = {
  startX: undefined,
  startY: undefined,
  endX: undefined,
  endY: undefined,
}

export default function Home() {
  const [mode, setMode] = useAtom(modeAtom)
  const currentOptions = useAtomValue(currentOptionsState)
  const setSelectedDrawingId = useSetAtom(selectedDrawingIdAtom)
  const [drawings, setDrawings] = useAtom(drawingsAtom)
  const selectedDrawing = useAtomValue(selectedDrawingState)

  //useState
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [grid, setGrid] = useState(true)
  const [point, setPoint] = useState<Point>(defaultPoint)
  const [vertexs, setVertexs] = useState<Vertex[]>([])
  const [spline, setSpline] = useState<Vertex[]>([])

  //useRef
  const move = useRef<{ drawing: Drawing; x: number; y: number } | null>(null)
  const isDragged = useRef(false)

  //constant
  const vertexsLastIndex = vertexs.length - 1

  const changeMode = useCallback(
    (next: Mode) => {
      move.current = null
      isDragged.current = false
      setSpline([])
      setPoint(defaultPoint)
      if (next.type !== 'VERTEX') setVertexs([])
      setMode(next)
    },
    [setMode],
  )

  //function
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    if (mode.type === 'SELECT') {
      const id = event.target instanceof SVGElement ? event.target.closest('svg[id]')?.id : null
      setSelectedDrawingId(id ?? null)
      const drawing = drawings.find((item) => item.id === id)
      if (drawing && mode.subType === 'SHAPE') {
        event.currentTarget.setPointerCapture(event.pointerId)
        move.current = { drawing, x: event.clientX, y: event.clientY }
      }
      return
    }
    if (mode.type !== 'SHAPE') return
    event.currentTarget.setPointerCapture(event.pointerId)
    isDragged.current = true
    setPoint({ ...defaultPoint, startX: event.clientX, startY: event.clientY })
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    const start = move.current
    if (start) {
      const moved = translateDrawing(start.drawing, event.clientX - start.x, event.clientY - start.y)
      setDrawings((items) =>
        items.map((item) => (item.id === moved.id ? { ...item, center: moved.center, vertexs: moved.vertexs } : item)),
      )
      return
    }
    if (!isDragged.current) return
    setPoint({ ...point, endX: event.clientX, endY: event.clientY })
  }

  const cancelDrag = () => {
    const start = move.current
    if (start) {
      setDrawings((items) =>
        items.map((item) =>
          item.id === start.drawing.id
            ? { ...item, center: start.drawing.center, vertexs: start.drawing.vertexs }
            : item,
        ),
      )
      move.current = null
    }
    isDragged.current = false
    setPoint(defaultPoint)
    setSpline([])
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    move.current = null
    if (!isDragged.current) return
    isDragged.current = false
    if (
      mode.type === 'SHAPE' &&
      mode.subType &&
      point.startX !== undefined &&
      point.startY !== undefined &&
      event.clientX !== point.startX &&
      event.clientY !== point.startY
    ) {
      const left = Math.min(point.startX, event.clientX)
      const right = Math.max(point.startX, event.clientX)
      const top = Math.min(point.startY, event.clientY)
      const bottom = Math.max(point.startY, event.clientY)
      const centerX = (left + right) / 2
      const centerY = (top + bottom) / 2
      const width = right - left
      const height = bottom - top
      const shapeVertexs: { [key: string]: Vertex[] } = {
        RECTANGLE: [
          { type: 'L', x: left, y: top, id: uuid() },
          { type: 'L', x: left, y: bottom, id: uuid() },
          { type: 'L', x: right, y: bottom, id: uuid() },
          { type: 'L', x: right, y: top, id: uuid() },
        ],
        TRIANGLE: [
          { type: 'L', x: centerX, y: top, id: uuid() },
          { type: 'L', x: left, y: bottom, id: uuid() },
          { type: 'L', x: right, y: bottom, id: uuid() },
        ],
        ELLIPSE: [
          {
            type: 'C',
            currentHandlerX: left,
            currentHandlerY: top + height / 4,
            nextHandlerX: left,
            nextHandlerY: bottom - height / 4,
            x: left,
            y: centerY,
            id: uuid(),
          },
          {
            type: 'C',
            currentHandlerX: left + width / 4,
            currentHandlerY: bottom,
            nextHandlerX: right - width / 4,
            nextHandlerY: bottom,
            x: centerX,
            y: bottom,
            id: uuid(),
          },
          {
            type: 'C',
            currentHandlerX: right,
            currentHandlerY: bottom - height / 4,
            nextHandlerX: right,
            nextHandlerY: top + height / 4,
            x: right,
            y: centerY,
            id: uuid(),
          },
          {
            type: 'C',
            currentHandlerX: right - width / 4,
            currentHandlerY: top,
            nextHandlerX: left + width / 4,
            nextHandlerY: top,
            x: centerX,
            y: top,
            id: uuid(),
          },
        ],
      }
      const drawingType: { [key: string]: DrawingType } = {
        RECTANGLE: 'POLYGON',
        TRIANGLE: 'POLYGON',
        ELLIPSE: 'ELLIPSE',
      }
      const newId = uuid()
      setDrawings([
        ...drawings,
        {
          id: newId,
          type: drawingType[mode.subType],
          subType: null,
          center: { x: centerX, y: centerY },
          width,
          height,
          rotate: 0,
          vertexs: shapeVertexs[mode.subType],
          fill: currentOptions.fill,
          stroke: currentOptions.stroke,
          strokeWidth: currentOptions.strokeWidth,
          opacity: currentOptions.opacity,
        },
      ])
      changeMode({ type: 'SELECT', subType: 'SHAPE' })
      setSelectedDrawingId(newId)
    }

    setPoint(defaultPoint)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (mode.type === 'VERTEX') {
      if (event.key === 'Escape') {
        setVertexs([])
        changeMode({ type: 'SELECT', subType: 'SHAPE' })
      }
      if (event.key === 'Enter') {
        addDrawingByVertexs('PATH')
      }
    }
  }

  const handleContextMenu = (event: React.MouseEvent) => {
    if (mode.type !== 'SELECT' || !(event.target instanceof SVGElement)) return
    const id = event.target.closest('.canvas-paper > svg[id]')?.id
    if (!id) return
    event.preventDefault()
    setSelectedDrawingId(id)
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const handlePenDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) return
    event.currentTarget.focus()
    if (event.button === 2) {
      return changeMode({ type: 'SELECT', subType: 'SHAPE' })
    }
    if (event.button !== 0) return
    setVertexs([...vertexs, { type: vertexs.length === 0 ? 'M' : 'L', x: event.clientX, y: event.clientY, id: uuid() }])
  }

  const handleVertexDown = (event: React.PointerEvent, index: number) => {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    if (index === 0) {
      addDrawingByVertexs('POLYGON')
    }
  }

  const addDrawingByVertexs = (type: 'PATH' | 'POLYGON') => {
    if (vertexs.length < (type === 'POLYGON' ? 3 : 2)) return
    const { width, height, center } = getInformationFromVertexs(vertexs)
    const newId = uuid()

    setDrawings([
      ...drawings,
      {
        id: newId,
        type,
        subType: null,
        vertexs,
        width,
        height,
        center,
        rotate: 0,
        fill: currentOptions.fill,
        stroke: currentOptions.stroke,
        strokeWidth: currentOptions.strokeWidth,
        opacity: currentOptions.opacity,
      },
    ])
    setVertexs([])
    changeMode({ type: 'SELECT', subType: 'SHAPE' })
    setSelectedDrawingId(newId)
  }

  return (
    <main aria-label="그림 편집기" className="workspace" onContextMenu={handleContextMenu}>
      <TopToolBar grid={grid} toggleGrid={() => setGrid((enabled) => !enabled)} />
      <SideToolBar
        mode={mode}
        changeMode={changeMode}
        penPoints={vertexs.length}
        finishPath={() => addDrawingByVertexs('PATH')}
      />
      <div
        aria-label="그리기 캔버스"
        className={'canvas-paper' + (grid ? ' with-grid' : '') + (mode.type === 'SHAPE' ? ' cursor-crosshair' : '')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelDrag}
      >
        {drawings.map((drawing: Drawing) => {
          switch (drawing.type) {
            case 'POLYGON':
            case 'PATH':
            case 'ELLIPSE':
              return <Path key={drawing.id} drawing={drawing} />
            case 'SPLINE':
              return <Spline key={drawing.id} drawing={drawing} />
            default:
              break
          }
        })}
      </div>
      {drawings.length === 0 && mode.type === 'SELECT' && (
        <div className="canvas-empty">
          <IoShapesOutline className="empty-icon" aria-hidden="true" />
          <h2>빈 캔버스</h2>
          <button
            type="button"
            className="tool-button"
            onClick={() => changeMode({ type: 'SHAPE', subType: 'RECTANGLE' })}
          >
            <FiPlus aria-hidden="true" />
            사각형 그리기
          </button>
        </div>
      )}
      {point.endX !== undefined && mode.type === 'SHAPE' && (
        <div
          className={
            'absolute border border-dashed border-violet-600 bg-violet-500/5' +
            (mode.subType === 'ELLIPSE' ? ' rounded-full' : '')
          }
          style={{
            left: getLeftFromPoint(point),
            top: getTopFromPoint(point),
            width: getWidthFromPoint(point),
            height: getHeightFromPoint(point),
            pointerEvents: 'none',
          }}
        ></div>
      )}
      {mode.type === 'VERTEX' && (
        <svg
          tabIndex={0}
          onPointerDown={handlePenDown}
          aria-label="펜으로 그리기"
          onKeyDown={handleKeyDown}
          className="canvas-overlay cursor-crosshair"
        >
          {vertexs.length > 1 && (
            <path
              d={
                `M ${vertexs[vertexsLastIndex].x} ${vertexs[vertexsLastIndex].y}` +
                vertexs
                  .map((vertex, index, vertexs) => {
                    const prevVertex = index === 0 ? vertexs[vertexsLastIndex] : vertexs[index - 1]
                    return {
                      M: `M ${vertex.x} ${vertex.y}`,
                      L: `L ${vertex.x} ${vertex.y}`,
                      C: `C ${prevVertex.nextHandlerX} ${prevVertex.nextHandlerY}, ${vertex.currentHandlerX} ${vertex.currentHandlerY}, ${vertex.x} ${vertex.y}`,
                      S: `S ${vertex.currentHandlerX} ${vertex.currentHandlerY}, ${vertex.x} ${vertex.y}`,
                    }[vertex.type!]
                  })
                  .join(' ')
              }
              fill={currentOptions.fill}
              stroke={currentOptions.stroke}
              strokeWidth={currentOptions.strokeWidth}
              opacity={currentOptions.opacity}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-violet-500 stroke-4"
            />
          )}
          {vertexs.map((vertex, index) => (
            <circle
              key={vertex.id}
              id={vertex.id}
              cx={vertex.x}
              cy={vertex.y}
              r="4"
              fill={'white'}
              strokeWidth={2}
              className={`${index === 0 ? 'stroke-red-400' : 'stroke-violet-500'}`}
              style={{ cursor: 'pointer' }}
              onPointerDown={(event) => handleVertexDown(event, index)}
            />
          ))}
        </svg>
      )}
      {mode.type === 'PENCIL' && (
        <svg
          tabIndex={0}
          aria-label="연필로 그리기"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            isDragged.current = true
            setSpline([{ type: null, x: event.clientX, y: event.clientY, id: uuid() }])
          }}
          onPointerCancel={cancelDrag}
          onPointerMove={(event) => {
            if (!event.isPrimary || !isDragged.current) return
            setSpline((spline) => [...spline, { type: null, x: event.clientX, y: event.clientY, id: uuid() }])
          }}
          onPointerUp={(event) => {
            if (!event.isPrimary || !isDragged.current) return
            if (spline.length < 2) {
              cancelDrag()
              return
            }
            const { center, width, height } = getSvgInformationFromPath(spline)

            setDrawings((drawings) => [
              ...drawings,
              {
                id: uuid(),
                type: 'SPLINE',
                subType: null,
                vertexs: spline,
                width,
                height,
                center,
                rotate: 0,
                fill: 'none',
                stroke: currentOptions.stroke,
                strokeWidth: currentOptions.strokeWidth,
                opacity: currentOptions.opacity,
              },
            ])
            setSpline([])
            isDragged.current = false
          }}
          onKeyDown={handleKeyDown}
          className="canvas-overlay cursor-pencil"
        >
          <path
            d={spline.reduce(
              (acc, point, i, a) => (i === 0 ? `M ${point.x},${point.y}` : `${acc} ${bezierCommand(point, i, a)}`),
              '',
            )}
            fill="none"
            stroke={currentOptions.stroke}
            strokeWidth={currentOptions.strokeWidth}
            opacity={currentOptions.opacity}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
      {menu && selectedDrawing && <DrawingMenu {...menu} onClose={closeMenu} />}
      {selectedDrawing && mode.subType === 'SHAPE' && <Handler key={selectedDrawing.id} drawing={selectedDrawing} />}
      {selectedDrawing && mode.subType === 'VERTEX' && (
        <VertexHandler key={selectedDrawing.id} drawing={selectedDrawing} />
      )}
    </main>
  )
}
