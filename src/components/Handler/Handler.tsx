import { drawingsAtom, gridAtom, documentState, selectedDrawingState, snapAtom, viewportAtom } from '@/recoil/atoms'
import { Direction } from '@/types/type'
import React, { useEffect, useState } from 'react'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { createPortal } from 'react-dom'
import { snapGuidesAtom } from '@/recoil/vertexSelection'
import { snapPoint, snapTranslation } from '@/utils/snapping'
import { IoCloseCircleOutline } from 'react-icons/io5'
import VerticalDivider from '../common/VerticalDivider'
import usePointDrag from '@/hooks/usePointDrag'
import { useOverlaySelection } from '@/hooks/useOverlaySelection'
import { LayerOrder, resizeDrawing, rotateDrawing, translateDrawing } from '@/utils/drawingGeometry'
import { useEditorActions } from '@/editor/useEditorActions'
import { reorderDocumentSelection } from '@/editor/operations'

const rotateHandler = [
  { key: 'TL', position: '-top-9 -left-9' },
  { key: 'TR', position: '-top-9 -right-9' },
  { key: 'BL', position: '-bottom-9 -left-9' },
  { key: 'BR', position: '-bottom-9 -right-9' },
]

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

type Transform = { type: 'TRANSLATE' | 'RESIZE' | 'ROTATE'; direction?: Direction }

const Handler = () => {
  const editorDocument = useRecoilValue(documentState)
  const actions = useEditorActions()
  const [drawings, setDrawings] = useRecoilState(drawingsAtom)
  const selectedDrawing = useRecoilValue(selectedDrawingState)
  const toggleUnderPointer = useOverlaySelection()
  const viewport = useRecoilValue(viewportAtom)
  const snapping = useRecoilValue(snapAtom)
  const grid = useRecoilValue(gridAtom)
  const setGuides = useSetRecoilState(snapGuidesAtom)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const { start, pointerHandlers } = usePointDrag<Transform>(
    selectedDrawing?.locked || selectedDrawing?.hidden ? null : selectedDrawing,
    (drawing, from, to, detail, modifiers) => {
      const others = drawings.filter((item) => item.id !== drawing.id)
      if (detail.type === 'TRANSLATE') {
        const delta = { x: to.x - from.x, y: to.y - from.y }
        if (modifiers.shift) {
          if (Math.abs(delta.x) >= Math.abs(delta.y)) delta.y = 0
          else delta.x = 0
        }
        const snapped =
          snapping && !modifiers.alt
            ? snapTranslation([drawing], others, delta, viewport.zoom, grid)
            : { point: delta, guides: [] }
        setGuides(snapped.guides)
        return translateDrawing(drawing, snapped.point.x, snapped.point.y)
      }
      if (detail.type === 'RESIZE') {
        const snapped =
          snapping && !modifiers.alt && !modifiers.shift
            ? snapPoint(to, others, viewport.zoom, grid)
            : { point: to, guides: [] }
        setGuides(snapped.guides)
        return resizeDrawing(drawing, detail.direction ?? null, from, snapped.point, modifiers.shift)
      }
      const initial = Math.atan2(from.y - drawing.center.y, from.x - drawing.center.x)
      const final = Math.atan2(to.y - drawing.center.y, to.x - drawing.center.x)
      const angle = (final - initial) * (180 / Math.PI)
      return rotateDrawing(
        drawing,
        modifiers.shift ? Math.round((drawing.rotate + angle) / 45) * 45 - drawing.rotate : angle,
      )
    },
    (next) => setDrawings((items) => items.map((item) => (item.id === next.id ? next : item))),
    () => setGuides([]),
  )

  useEffect(() => setMenu(null), [selectedDrawing?.id])

  useEffect(() => {
    if (!menu) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menu])

  if (!selectedDrawing || selectedDrawing.hidden || selectedDrawing.locked) return null
  const canRaise =
    Boolean(menu) && reorderDocumentSelection(editorDocument, [selectedDrawing.id], 'up') !== editorDocument
  const canLower =
    Boolean(menu) && reorderDocumentSelection(editorDocument, [selectedDrawing.id], 'down') !== editorDocument
  const reorder = (order: LayerOrder) => {
    const direction = order === 'forward' ? 'up' : order === 'backward' ? 'down' : order
    actions.updateDocument((current) => reorderDocumentSelection(current, [selectedDrawing.id], direction))
    setMenu(null)
  }
  const begin = (event: React.PointerEvent<Element>, detail: Transform) => {
    setMenu(null)
    if (detail.type === 'TRANSLATE' && toggleUnderPointer(event)) return
    start(event, detail)
  }

  return (
    <>
      <div
        aria-label="Selected object"
        data-testid="selection-handler"
        className="absolute border-solid border-blue-400 cursor-move pointer-events-auto touch-none"
        style={{
          borderWidth: 1 / viewport.zoom,
          width: Math.max(selectedDrawing.width, 1),
          height: Math.max(selectedDrawing.height, 1),
          left: selectedDrawing.center.x - Math.max(selectedDrawing.width, 1) / 2,
          top: selectedDrawing.center.y - Math.max(selectedDrawing.height, 1) / 2,
          rotate: `${selectedDrawing.rotate}deg`,
        }}
        onPointerDown={(event) => begin(event, { type: 'TRANSLATE' })}
        {...pointerHandlers}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setMenu({ x: event.clientX, y: event.clientY })
        }}
      >
        {resizeHandler.map(({ position, direction }) => (
          <div
            key={direction}
            title={`Resize ${direction}`}
            data-testid={`resize-${direction}`}
            className={`${position} absolute -translate-x-1/2 -translate-y-1/2 bg-white border-solid border-blue-400 rounded-full cursor-nwse-resize touch-none`}
            style={{ width: 12 / viewport.zoom, height: 12 / viewport.zoom, borderWidth: 2 / viewport.zoom }}
            onPointerDown={(event) => begin(event, { type: 'RESIZE', direction: direction as Direction })}
          />
        ))}
        {rotateHandler.map(({ key }) => (
          <div
            key={key}
            title="Rotate object"
            data-testid={`rotate-${key}`}
            className="absolute cursor-rotate touch-none"
            style={{
              width: 28 / viewport.zoom,
              height: 28 / viewport.zoom,
              [key.includes('T') ? 'top' : 'bottom']: -32 / viewport.zoom,
              [key.includes('L') ? 'left' : 'right']: -32 / viewport.zoom,
            }}
            onPointerDown={(event) => begin(event, { type: 'ROTATE' })}
          />
        ))}
      </div>
      {menu &&
        createPortal(
          <div
            role="group"
            aria-label="Object actions"
            className="fixed z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2.5 rounded-lg bg-gray-600 p-3 text-sm text-white shadow-lg"
            style={{
              left: Math.max(16, Math.min(menu.x, window.innerWidth - 580)),
              top: Math.max(16, Math.min(menu.y, window.innerHeight - 100)),
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                actions.deleteSelection()
                setMenu(null)
              }}
            >
              Delete
            </button>
            <VerticalDivider />
            <button type="button" disabled={!canRaise} className="disabled:opacity-40" onClick={() => reorder('front')}>
              Bring To Front
            </button>
            <VerticalDivider />
            <button type="button" disabled={!canLower} className="disabled:opacity-40" onClick={() => reorder('back')}>
              Send To Back
            </button>
            <VerticalDivider />
            <button
              type="button"
              disabled={!canRaise}
              className="disabled:opacity-40"
              onClick={() => reorder('forward')}
            >
              Bring Forward
            </button>
            <VerticalDivider />
            <button
              type="button"
              disabled={!canLower}
              className="disabled:opacity-40"
              onClick={() => reorder('backward')}
            >
              Send Backward
            </button>
            <VerticalDivider />
            <button type="button" aria-label="Close object actions" onClick={() => setMenu(null)}>
              <IoCloseCircleOutline size={24} />
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

export default Handler
