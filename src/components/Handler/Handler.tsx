import { FiRotateCw } from 'react-icons/fi'
import { drawingsAtom } from '@/state/drawing'
import { Direction, Drawing } from '@/types/type'
import React, { useRef } from 'react'
import { useSetAtom } from 'jotai'
import { remap } from '@/utils/remap'
import { rotateVertex } from '@/utils/rotateVertex'
import usePointDrag from '@/hooks/usePointDrag'

const resizeHandler = [
  { position: 'top-0 left-1/2', direction: 'T' },
  { position: 'top-1/2 left-0', direction: 'L' },
  { position: 'top-full left-1/2', direction: 'B' },
  { position: 'top-1/2 left-full', direction: 'R' },
  { position: 'top-0 left-0', direction: 'TL' },
  { position: 'top-0 left-full', direction: 'TR' },
  { position: 'top-full left-0', direction: 'BL' },
  { position: 'top-full left-full', direction: 'BR' },
]

const Handler = ({ drawing: selectedDrawing }: { drawing: Drawing }) => {
  const setDrawings = useSetAtom(drawingsAtom)
  // custom hooks
  const { point, isDragged, onDrag, offDrag, prevRef, setStartPoint, resetPoint, resetPrev } = usePointDrag()

  const transitionType = useRef<'RESIZE' | 'ROTATE' | null>(null)
  const handlerRef = useRef<HTMLDivElement>(null)
  const directionRef = useRef<Direction>(null)

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resetPrev()
    onDrag()
    setStartPoint(event)

    if (!handlerRef.current) return
    prevRef.current.width = handlerRef.current.offsetWidth
    prevRef.current.height = handlerRef.current.offsetHeight
    prevRef.current.center.x = handlerRef.current.offsetLeft + prevRef.current.width / 2
    prevRef.current.center.y = handlerRef.current.offsetTop + prevRef.current.height / 2
    prevRef.current.rotate = selectedDrawing.rotate
    prevRef.current.vertexs = selectedDrawing.vertexs
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    event.stopPropagation()
    if (
      !isDragged.current ||
      !handlerRef.current ||
      point.current.startX === undefined ||
      point.current.startY === undefined ||
      prevRef.current.width === null ||
      prevRef.current.height === null ||
      prevRef.current.center.x === null ||
      prevRef.current.center.y === null ||
      prevRef.current.rotate === null
    )
      return

    if (transitionType.current === 'RESIZE') {
      if (!directionRef.current) return

      const rotatedStartPoint = rotateVertex(
        point.current.startX,
        point.current.startY,
        prevRef.current.center.x,
        prevRef.current.center.y,
        -prevRef.current.rotate,
      )
      const rotatedEndPoint = rotateVertex(
        event.clientX,
        event.clientY,
        prevRef.current.center.x,
        prevRef.current.center.y,
        -prevRef.current.rotate,
      )

      const resize = (deltaX: number, deltaY: number) => {
        if (handlerRef.current === null || prevRef.current.width === null || prevRef.current.height === null) return
        const nextCenterX =
          (handlerRef.current.getBoundingClientRect().left + handlerRef.current.getBoundingClientRect().right) / 2

        const nextCenterY =
          (handlerRef.current.getBoundingClientRect().top + handlerRef.current.getBoundingClientRect().bottom) / 2

        const width = prevRef.current.width === 0 ? 0 : prevRef.current.width + deltaX
        const height = prevRef.current.height === 0 ? 0 : prevRef.current.height + deltaY

        const nextWidth = Math.abs(width)
        const nextHeight = Math.abs(height)

        const nextVertexs = prevRef.current.vertexs?.map((vertex) => {
          const getNextVertex = (prevX: number, prevY: number) => {
            const rotatedVertex = rotateVertex(
              prevX,
              prevY,
              prevRef.current.center.x!,
              prevRef.current.center.y!,
              -prevRef.current.rotate!,
            )
            const nextX = remap(
              rotatedVertex.x,
              -prevRef.current.width! / 2,
              prevRef.current.width! / 2,
              -width / 2,
              width / 2,
            )
            const nextY = remap(
              rotatedVertex.y,
              -prevRef.current.height! / 2,
              prevRef.current.height! / 2,
              -height / 2,
              height / 2,
            )
            return rotateVertex(nextX, nextY, 0, 0, prevRef.current.rotate!)
          }
          let nextVertex = { ...vertex }
          const { x, y } = getNextVertex(vertex.x, vertex.y)
          nextVertex = { ...nextVertex, x: x + prevRef.current.center.x!, y: y + prevRef.current.center.y! }
          if (vertex.currentHandlerX !== undefined && vertex.currentHandlerY !== undefined) {
            const { x: currentHandlerX, y: currentHandlerY } = getNextVertex(
              vertex.currentHandlerX,
              vertex.currentHandlerY,
            )
            nextVertex = {
              ...nextVertex,
              currentHandlerX: currentHandlerX + prevRef.current.center.x!,
              currentHandlerY: currentHandlerY + prevRef.current.center.y!,
            }
          }
          if (vertex.nextHandlerX !== undefined && vertex.nextHandlerY !== undefined) {
            const { x: nextHandlerX, y: nextHandlerY } = getNextVertex(vertex.nextHandlerX, vertex.nextHandlerY)
            nextVertex = {
              ...nextVertex,
              nextHandlerX: nextHandlerX + prevRef.current.center.x!,
              nextHandlerY: nextHandlerY + prevRef.current.center.y!,
            }
          }
          return nextVertex
        })

        handlerRef.current.style.width = nextWidth + 'px'
        handlerRef.current.style.height = nextHeight + 'px'
        handlerRef.current.style.left = nextCenterX - nextWidth / 2 + 'px'
        handlerRef.current.style.top = nextCenterY - nextHeight / 2 + 'px'

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
      const deltaX = (rotatedEndPoint.x - rotatedStartPoint.x) * 2
      const deltaY = (rotatedEndPoint.y - rotatedStartPoint.y) * 2

      switch (directionRef.current) {
        case 'TL':
          resize(-deltaX, -deltaY)
          break
        case 'T':
          resize(0, -deltaY)
          break
        case 'TR':
          resize(deltaX, -deltaY)
          break
        case 'L':
          resize(-deltaX, 0)
          break
        case 'R':
          resize(deltaX, 0)
          break
        case 'BL':
          resize(-deltaX, deltaY)
          break
        case 'B':
          resize(0, deltaY)
          break
        case 'BR':
          resize(deltaX, deltaY)
          break
        default:
          break
      }
    } else if (transitionType.current === 'ROTATE' && prevRef.current.rotate !== null) {
      document.body.style.cursor = 'url(/image/cursor/rotate.svg) 12 12, auto'
      const initialAngle =
        Math.atan2(point.current.startX - prevRef.current.center.x, point.current.startY - prevRef.current.center.y) *
        (180 / Math.PI)
      const finalAngle =
        Math.atan2(event.clientX - prevRef.current.center.x, event.clientY - prevRef.current.center.y) * (180 / Math.PI)

      const rotateAngle = initialAngle - finalAngle
      const nextRotate = prevRef.current.rotate + rotateAngle
      handlerRef.current.style.rotate = nextRotate + 'deg'

      const nextVertexs = prevRef.current.vertexs.map((vertex) => {
        const getNextVertex = (prevX: number, prevY: number) => {
          const r = rotateAngle * (Math.PI / 180)

          const nextX =
            (prevX - prevRef.current.center.x!) * Math.cos(r) -
            (prevY - prevRef.current.center.y!) * Math.sin(r) +
            prevRef.current.center.x!
          const nextY =
            (prevX - prevRef.current.center.x!) * Math.sin(r) +
            (prevY - prevRef.current.center.y!) * Math.cos(r) +
            prevRef.current.center.y!

          return { x: nextX, y: nextY }
        }

        let nextVertex = { ...vertex }
        const { x, y } = getNextVertex(vertex.x, vertex.y)
        nextVertex = { ...nextVertex, x, y }
        if (vertex.currentHandlerX !== undefined && vertex.currentHandlerY !== undefined) {
          const { x: currentHandlerX, y: currentHandlerY } = getNextVertex(
            vertex.currentHandlerX,
            vertex.currentHandlerY,
          )
          nextVertex = {
            ...nextVertex,
            currentHandlerX: currentHandlerX,
            currentHandlerY: currentHandlerY,
          }
        }
        if (vertex.nextHandlerX !== undefined && vertex.nextHandlerY !== undefined) {
          const { x: nextHandlerX, y: nextHandlerY } = getNextVertex(vertex.nextHandlerX, vertex.nextHandlerY)
          nextVertex = {
            ...nextVertex,
            nextHandlerX: nextHandlerX,
            nextHandlerY: nextHandlerY,
          }
        }
        return nextVertex
      })

      setDrawings((drawings) =>
        drawings.map((drawing) =>
          drawing.id === selectedDrawing.id
            ? {
                ...drawing,
                rotate: nextRotate,
                vertexs: nextVertexs,
              }
            : drawing,
        ),
      )
    }
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!event.isPrimary) return
    event.stopPropagation()
    document.body.style.cursor = 'auto'

    offDrag()
    resetPoint()
    transitionType.current = null
  }

  return (
    <div
      ref={handlerRef}
      className="selection-box absolute pointer-events-none touch-none"
      style={{
        width: selectedDrawing.width,
        height: selectedDrawing.height,
        left: selectedDrawing.center.x - selectedDrawing.width / 2,
        top: selectedDrawing.center.y - selectedDrawing.height / 2,
        rotate: selectedDrawing.rotate + 'deg',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {resizeHandler.map(({ position, direction }) => (
        <div
          key={direction}
          className={`${position} selection-handle absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`}
          onPointerDown={(e) => {
            transitionType.current = 'RESIZE'
            directionRef.current = direction as Direction
            handlePointerDown(e)
          }}
        />
      ))}
      <div
        className="rotation-handle pointer-events-auto cursor-rotate"
        title="드래그해서 회전"
        onPointerDown={(e) => {
          transitionType.current = 'ROTATE'
          handlePointerDown(e)
        }}
      >
        <FiRotateCw aria-hidden="true" />
      </div>
    </div>
  )
}

export default Handler
