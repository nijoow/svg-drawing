import React, { memo, useId, useMemo } from 'react'
import type { Drawing } from '@/types/type'
import { getDrawingBounds } from '@/editor/document'
import { renderDrawingMarkup } from '@/editor/renderDrawing'

/** Render siblings in a shared SVG so blend modes can see the preceding artwork. */
export const DrawingContent = memo(function DrawingContent({
  drawing,
  prefix = 'canvas',
}: {
  drawing: Drawing
  prefix?: string
}) {
  const markup = useMemo(() => renderDrawingMarkup(drawing, { prefix, interactive: true }), [drawing, prefix])
  if (!markup) return null
  // renderDrawingMarkup escapes strings, rejects active image sources and emits only fixed SVG tags.
  return <g data-drawing-id={drawing.id} dangerouslySetInnerHTML={{ __html: markup }} />
})

const DrawingNode = memo(function DrawingNode({ drawing }: { drawing: Drawing }) {
  const prefix = useId()
  if (drawing.hidden || !drawing.vertexs.length) return null
  const bounds = getDrawingBounds(drawing)
  return (
    <svg
      data-drawing-id={drawing.id}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      width={bounds.width}
      height={bounds.height}
      overflow="visible"
      className="absolute pointer-events-none"
      style={{ left: bounds.minX, top: bounds.minY, mixBlendMode: drawing.blendMode ?? 'normal' }}
    >
      <DrawingContent drawing={drawing} prefix={prefix} />
    </svg>
  )
})

export default DrawingNode
