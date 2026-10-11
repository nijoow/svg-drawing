import { useEditorActions } from '@/editor/useEditorActions'
import { historyState, viewportAtom } from '@/recoil/atoms'
import { Drawing } from '@/types/type'
import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react'
import { useRecoilValue } from 'recoil'

export type Position = { x: number; y: number }
export type DragModifiers = { shift: boolean; alt: boolean; meta: boolean }
type Viewport = { x: number; y: number; zoom: number }
type Gesture<Value, Detail> = {
  value: Value
  key: string
  start: Position
  detail: Detail
  pointerId: number
  target: Element
  last: Position
  viewport: Viewport
  modifiers: DragModifiers
}

/** One captured pointer gesture maps to one undo entry, including multi-object edits. */
export const useTransformDrag = <Value, Detail>(
  value: Value | null,
  key: string,
  transform: (value: Value, start: Position, end: Position, detail: Detail, modifiers: DragModifiers) => Value,
  onChange: (value: Value) => void,
  onEnd?: () => void,
) => {
  const { beginTransaction, endTransaction, cancelTransaction } = useEditorActions()
  const { inTransaction } = useRecoilValue(historyState)
  const viewport = useRecoilValue(viewportAtom)
  const gesture = useRef<Gesture<Value, Detail> | null>(null)
  const current = useRef({ value, key, transform, onChange, onEnd, inTransaction })
  current.current = { value, key, transform, onChange, onEnd, inTransaction }

  const release = useCallback(() => {
    const previous = gesture.current
    gesture.current = null
    if (previous?.target.hasPointerCapture(previous.pointerId))
      previous.target.releasePointerCapture(previous.pointerId)
    if (previous) current.current.onEnd?.()
    return previous
  }, [])

  const cancel = useCallback(() => {
    if (release()) cancelTransaction()
  }, [cancelTransaction, release])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) {
        event.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('blur', cancel)
      cancel()
    }
  }, [cancel])

  useEffect(() => {
    if (gesture.current && gesture.current.key !== key) cancel()
  }, [key, cancel])

  useEffect(() => {
    if (!inTransaction) release()
  }, [inTransaction, release])

  const start = (event: ReactPointerEvent<Element>, detail: Detail) => {
    if (event.button !== 0 || !event.isPrimary || value === null || gesture.current || current.current.inTransaction)
      return
    event.stopPropagation()
    event.preventDefault()
    beginTransaction()
    current.current.inTransaction = true
    const point = { x: (event.clientX - viewport.x) / viewport.zoom, y: (event.clientY - viewport.y) / viewport.zoom }
    gesture.current = {
      value,
      key,
      start: point,
      last: point,
      detail,
      pointerId: event.pointerId,
      target: event.currentTarget,
      viewport,
      modifiers: { shift: event.shiftKey, alt: event.altKey, meta: event.metaKey || event.ctrlKey },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: ReactPointerEvent<Element>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (!current.current.inTransaction || current.current.key !== active.key) {
      release()
      return
    }
    const point = {
      x: (event.clientX - active.viewport.x) / active.viewport.zoom,
      y: (event.clientY - active.viewport.y) / active.viewport.zoom,
    }
    const modifiers = { shift: event.shiftKey, alt: event.altKey, meta: event.metaKey || event.ctrlKey }
    if (
      point.x === active.last.x &&
      point.y === active.last.y &&
      modifiers.shift === active.modifiers.shift &&
      modifiers.alt === active.modifiers.alt &&
      modifiers.meta === active.modifiers.meta
    )
      return
    active.last = point
    active.modifiers = modifiers
    current.current.onChange(current.current.transform(active.value, active.start, point, active.detail, modifiers))
  }

  const finish = (event: ReactPointerEvent<Element>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    move(event)
    if (release()) endTransaction()
  }

  const cancelPointer = (event: ReactPointerEvent<Element>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    cancel()
  }

  return {
    start,
    cancel,
    pointerHandlers: {
      onPointerMove: move,
      onPointerUp: finish,
      onPointerCancel: cancelPointer,
      onLostPointerCapture: cancelPointer,
    },
  }
}

const usePointDrag = <Detail>(
  drawing: Drawing | null,
  transform: (drawing: Drawing, start: Position, end: Position, detail: Detail, modifiers: DragModifiers) => Drawing,
  onChange: (drawing: Drawing) => void,
  onEnd?: () => void,
) => useTransformDrag(drawing, drawing?.id ?? '', transform, onChange, onEnd)

export default usePointDrag
