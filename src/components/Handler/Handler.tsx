import { FiRotateCw } from 'react-icons/fi'
import { gestureAtom } from '@/state/drawing'
import { Direction, Drawing } from '@/types/type'
import React, { useRef } from 'react'
import { useSetAtom } from 'jotai'
import { resizeDrawing, rotateDrawing } from '@/utils/transformDrawing'

const resizeHandler = [
  { position: 'top-0 left-1/2', direction: 'T' },
  { position: 'top-1/2 left-0', direction: 'L' },
  { position: 'top-full left-1/2', direction: 'B' },
  { position: 'top-1/2 left-full', direction: 'R' },
  { position: 'top-0 left-0', direction: 'TL' },
  { position: 'top-0 left-full', direction: 'TR' },
  { position: 'top-full left-0', direction: 'BL' },
  { position: 'top-full left-full', direction: 'BR' },
] as const

const Handler = ({ drawing: selectedDrawing }: { drawing: Drawing }) => {
  const gesture = useSetAtom(gestureAtom)
  const drag = useRef<{
    start: { x: number; y: number }
    drawing: Drawing
    handle: NonNullable<Direction> | 'rotate'
  } | null>(null)

  const handlePointerDown = (event: React.PointerEvent, handle: NonNullable<Direction> | 'rotate') => {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { drawing: selectedDrawing, start: { x: event.clientX, y: event.clientY }, handle }
    gesture('begin')
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!event.isPrimary || !drag.current) return
    const { drawing, start, handle } = drag.current
    const next =
      handle === 'rotate'
        ? rotateDrawing(drawing, start, { x: event.clientX, y: event.clientY })
        : resizeDrawing(drawing, handle, event.clientX - start.x, event.clientY - start.y)
    gesture((items) => {
      const index = items.findIndex((item) => item.id === drawing.id)
      return index === -1 || items[index] === next ? items : items.map((item, i) => (i === index ? next : item))
    })
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!event.isPrimary || !drag.current) return
    drag.current = null
    gesture(event.type === 'pointerup' ? 'finish' : 'cancel')
  }

  return (
    <div
      className="selection-box absolute pointer-events-none touch-none"
      style={{
        width: selectedDrawing.width,
        height: selectedDrawing.height,
        left: selectedDrawing.center.x - selectedDrawing.width / 2,
        top: selectedDrawing.center.y - selectedDrawing.height / 2,
        rotate: selectedDrawing.rotate + 'deg',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {resizeHandler.map(({ position, direction }) => (
        <div
          key={direction}
          className={`${position} selection-handle absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`}
          onPointerDown={(event) => handlePointerDown(event, direction)}
        />
      ))}
      <div
        className="rotation-handle pointer-events-auto cursor-rotate"
        title="드래그해서 회전"
        onPointerDown={(event) => handlePointerDown(event, 'rotate')}
      >
        <FiRotateCw aria-hidden="true" />
      </div>
    </div>
  )
}

export default Handler
