import type { DrawingBounds } from './document'

export interface Viewport {
  x: number
  y: number
  zoom: number
}
export type Position = { x: number; y: number }
export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 16

export const clampZoom = (zoom: number) => (Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1)

export const screenToDocument = (viewport: Viewport, point: Position): Position => ({
  x: (point.x - viewport.x) / viewport.zoom,
  y: (point.y - viewport.y) / viewport.zoom,
})

export const documentToScreen = (viewport: Viewport, point: Position): Position => ({
  x: point.x * viewport.zoom + viewport.x,
  y: point.y * viewport.zoom + viewport.y,
})

export function zoomViewportAt(viewport: Viewport, zoom: number, screenPoint: Position): Viewport {
  const point = screenToDocument(viewport, screenPoint)
  const nextZoom = clampZoom(zoom)
  return { x: screenPoint.x - point.x * nextZoom, y: screenPoint.y - point.y * nextZoom, zoom: nextZoom }
}

export function fitViewportToBounds(bounds: DrawingBounds, width: number, height: number, padding = 80): Viewport {
  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)
  const zoom = clampZoom(
    Math.min(availableWidth / Math.max(1, bounds.width), availableHeight / Math.max(1, bounds.height)),
  )
  return {
    x: width / 2 - (bounds.minX + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.minY + bounds.height / 2) * zoom,
    zoom,
  }
}
