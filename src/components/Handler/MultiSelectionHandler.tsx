import React from 'react'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { drawingsAtom, gridAtom, selectedDrawingsState, snapAtom, viewportAtom } from '@/recoil/atoms'
import { snapGuidesAtom } from '@/recoil/vertexSelection'
import { useTransformDrag } from '@/hooks/usePointDrag'
import { useOverlaySelection } from '@/hooks/useOverlaySelection'
import { Direction, Drawing } from '@/types/type'
import { getSelectionBounds, resizeDrawings, rotateDrawingAround, translateDrawing } from '@/utils/drawingGeometry'
import { snapPoint, snapTranslation } from '@/utils/snapping'

type Transform = { type: 'TRANSLATE' | 'RESIZE' | 'ROTATE'; direction?: Direction }
const handles: { direction: Direction; left: string; top: string }[] = [
  { direction: 'TL', left: '0%', top: '0%' },
  { direction: 'T', left: '50%', top: '0%' },
  { direction: 'TR', left: '100%', top: '0%' },
  { direction: 'L', left: '0%', top: '50%' },
  { direction: 'R', left: '100%', top: '50%' },
  { direction: 'BL', left: '0%', top: '100%' },
  { direction: 'B', left: '50%', top: '100%' },
  { direction: 'BR', left: '100%', top: '100%' },
]

export default function MultiSelectionHandler() {
  const [drawings, setDrawings] = useRecoilState(drawingsAtom)
  const selected = useRecoilValue(selectedDrawingsState)
  const toggleUnderPointer = useOverlaySelection()
  const editable = selected.filter((drawing) => !drawing.locked && !drawing.hidden)
  const viewport = useRecoilValue(viewportAtom)
  const snapping = useRecoilValue(snapAtom)
  const grid = useRecoilValue(gridAtom)
  const setGuides = useSetRecoilState(snapGuidesAtom)
  const { start, pointerHandlers } = useTransformDrag<Drawing[], Transform>(
    editable.length > 1 ? editable : null,
    editable
      .map((drawing) => drawing.id)
      .sort()
      .join('|'),
    (items, from, to, detail, modifiers) => {
      const movingIds = new Set(items.map((item) => item.id))
      const others = drawings.filter((drawing) => !movingIds.has(drawing.id))
      if (detail.type === 'TRANSLATE') {
        const delta = { x: to.x - from.x, y: to.y - from.y }
        if (modifiers.shift) {
          if (Math.abs(delta.x) >= Math.abs(delta.y)) delta.y = 0
          else delta.x = 0
        }
        const snapped =
          snapping && !modifiers.alt
            ? snapTranslation(items, others, delta, viewport.zoom, grid)
            : { point: delta, guides: [] }
        setGuides(snapped.guides)
        return items.map((drawing) => translateDrawing(drawing, snapped.point.x, snapped.point.y))
      }
      if (detail.type === 'RESIZE') {
        const snapped =
          snapping && !modifiers.alt && !modifiers.shift
            ? snapPoint(to, others, viewport.zoom, grid)
            : { point: to, guides: [] }
        setGuides(snapped.guides)
        return resizeDrawings(items, detail.direction ?? null, from, snapped.point, modifiers.shift)
      }
      const { center } = getSelectionBounds(items)
      const angle =
        ((Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x)) * 180) /
        Math.PI
      return items.map((drawing) =>
        rotateDrawingAround(drawing, modifiers.shift ? Math.round(angle / 45) * 45 : angle, center),
      )
    },
    (next) => {
      const replacements = new Map(next.map((drawing) => [drawing.id, drawing]))
      setDrawings((items) => items.map((drawing) => replacements.get(drawing.id) ?? drawing))
    },
    () => setGuides([]),
  )
  if (editable.length < 2) return null
  const bounds = getSelectionBounds(editable)
  return (
    <div
      aria-label="Selected objects"
      data-testid="multi-selection-handler"
      className="absolute border-dashed border-blue-400 cursor-move pointer-events-auto touch-none"
      style={{
        left: bounds.minX,
        top: bounds.minY,
        width: Math.max(bounds.width, 1),
        height: Math.max(bounds.height, 1),
        borderWidth: 1 / viewport.zoom,
      }}
      onPointerDown={(event) => {
        if (!toggleUnderPointer(event)) start(event, { type: 'TRANSLATE' })
      }}
      {...pointerHandlers}
    >
      <span
        className="absolute whitespace-nowrap rounded bg-blue-500 px-2 py-0.5 text-xs text-white pointer-events-none"
        style={{
          top: -28 / viewport.zoom,
          left: 0,
          transform: `scale(${1 / viewport.zoom})`,
          transformOrigin: 'left bottom',
        }}
      >
        {editable.length} objects
      </span>
      {handles.map(({ direction, left, top }) => (
        <div
          key={direction}
          title={`Resize selection ${direction} (Shift: proportional)`}
          data-testid={`multi-resize-${direction}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-blue-400 bg-white cursor-nwse-resize touch-none"
          style={{ left, top, width: 12 / viewport.zoom, height: 12 / viewport.zoom, borderWidth: 2 / viewport.zoom }}
          onPointerDown={(event) => start(event, { type: 'RESIZE', direction })}
        />
      ))}
      <div
        title="Rotate selection (Shift: 45°)"
        data-testid="multi-rotate"
        className="absolute cursor-rotate touch-none"
        style={{
          right: -32 / viewport.zoom,
          top: -32 / viewport.zoom,
          width: 28 / viewport.zoom,
          height: 28 / viewport.zoom,
        }}
        onPointerDown={(event) => start(event, { type: 'ROTATE' })}
      />
    </div>
  )
}
