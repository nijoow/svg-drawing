import { getDrawingBounds, type DrawingBounds, type EditorDocument } from './document'

/** Viewing includes locked artwork; editing selection deliberately excludes it. */
export function getViewBounds(document: EditorDocument, selectedIds?: readonly string[]): DrawingBounds {
  const drawings = document.drawings.filter(
    (drawing) => !drawing.hidden && (!selectedIds?.length || selectedIds.includes(drawing.id)),
  )
  const bounds = drawings.map(getDrawingBounds)
  if (!selectedIds?.length) {
    document.artboards.forEach((board) =>
      bounds.push({
        minX: board.x,
        minY: board.y,
        maxX: board.x + board.width,
        maxY: board.y + board.height,
        width: board.width,
        height: board.height,
      }),
    )
  }
  if (!bounds.length)
    return { minX: 0, minY: 0, maxX: document.canvas.width, maxY: document.canvas.height, ...document.canvas }
  const minX = Math.min(...bounds.map((item) => item.minX)),
    minY = Math.min(...bounds.map((item) => item.minY))
  const maxX = Math.max(...bounds.map((item) => item.maxX)),
    maxY = Math.max(...bounds.map((item) => item.maxY))
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}
