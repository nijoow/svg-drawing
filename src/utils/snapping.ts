import { Drawing } from '@/types/type'
import { getSelectionBounds, Position } from './drawingGeometry'

export type SnapGuide = { axis: 'x' | 'y'; value: number }
export type SnapResult = { point: Position; guides: SnapGuide[] }

/** Snap within six screen pixels; threshold is independent of zoom. */
export function snapPoint(point: Position, drawings: Drawing[], zoom: number, grid: boolean): SnapResult {
  const threshold = 6 / Math.max(zoom, 0.05)
  const targets = drawings.filter((drawing) => !drawing.hidden).map((drawing) => getSelectionBounds([drawing]))
  const candidates = {
    x: targets.flatMap((bounds) => [bounds.minX, bounds.center.x, bounds.maxX]),
    y: targets.flatMap((bounds) => [bounds.minY, bounds.center.y, bounds.maxY]),
  }
  if (grid) {
    candidates.x.push(Math.round(point.x / 10) * 10)
    candidates.y.push(Math.round(point.y / 10) * 10)
  }
  const result: SnapResult = { point: { ...point }, guides: [] }
  for (const axis of ['x', 'y'] as const) {
    let distance = threshold
    let matched = false
    for (const target of candidates[axis]) {
      const delta = Math.abs(target - point[axis])
      if (delta <= distance) {
        matched = true
        result.point[axis] = target
        distance = delta
      }
    }
    if (matched) result.guides.push({ axis, value: result.point[axis] })
  }
  return result
}

export function snapTranslation(
  moving: Drawing[],
  others: Drawing[],
  delta: Position,
  zoom: number,
  grid: boolean,
): SnapResult {
  const bounds = getSelectionBounds(moving)
  const positions = [
    { x: bounds.minX + delta.x, y: bounds.minY + delta.y },
    { x: bounds.center.x + delta.x, y: bounds.center.y + delta.y },
    { x: bounds.maxX + delta.x, y: bounds.maxY + delta.y },
  ]
  const result: SnapResult = { point: { ...delta }, guides: [] }
  for (const axis of ['x', 'y'] as const) {
    let distance = Infinity
    for (const point of positions) {
      const snapped = snapPoint(point, others, zoom, grid)
      const guide = snapped.guides.find((item) => item.axis === axis)
      if (guide && Math.abs(snapped.point[axis] - point[axis]) < distance) {
        distance = Math.abs(snapped.point[axis] - point[axis])
        result.point[axis] = delta[axis] + snapped.point[axis] - point[axis]
        const existing = result.guides.findIndex((item) => item.axis === axis)
        if (existing >= 0) result.guides[existing] = guide
        else result.guides.push(guide)
      }
    }
  }
  return result
}
