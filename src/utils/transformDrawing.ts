import type { Direction, Drawing, Vertex } from '@/types/type'
import { rotateVertex } from './rotateVertex.ts'

type XY = Drawing['center']
function mapVertex(vertex: Vertex, transform: (x: number, y: number) => XY) {
  const next = { ...vertex, ...transform(vertex.x, vertex.y) }
  if (vertex.currentHandlerX !== undefined && vertex.currentHandlerY !== undefined) {
    const point = transform(vertex.currentHandlerX, vertex.currentHandlerY)
    next.currentHandlerX = point.x
    next.currentHandlerY = point.y
  }
  if (vertex.nextHandlerX !== undefined && vertex.nextHandlerY !== undefined) {
    const point = transform(vertex.nextHandlerX, vertex.nextHandlerY)
    next.nextHandlerX = point.x
    next.nextHandlerY = point.y
  }
  return next
}

function resizedAxis(size: number, delta: number) {
  if (size === 0 || delta === 0) return size
  const target = size + delta
  // Preserve a nonzero local span so the next gesture can expand it again.
  return (target < 0 ? -1 : 1) * Math.max(Math.min(size, 1), Math.abs(target))
}

export function resizeDrawing(drawing: Drawing, handle: NonNullable<Direction>, dx: number, dy: number): Drawing {
  const local = rotateVertex(dx, dy, 0, 0, -drawing.rotate)
  const width = resizedAxis(drawing.width, handle.includes('L') ? -2 * local.x : handle.includes('R') ? 2 * local.x : 0)
  const height = resizedAxis(
    drawing.height,
    handle.includes('T') ? -2 * local.y : handle.includes('B') ? 2 * local.y : 0,
  )
  if (width === drawing.width && height === drawing.height) return drawing
  const { center, rotate } = drawing
  const scale = (x: number, y: number) => {
    const point = rotateVertex(x, y, center.x, center.y, -rotate)
    const scaled = rotateVertex(
      point.x * (drawing.width ? width / drawing.width : 1),
      point.y * (drawing.height ? height / drawing.height : 1),
      0,
      0,
      rotate,
    )
    return { x: scaled.x + center.x, y: scaled.y + center.y }
  }
  return {
    ...drawing,
    width: Math.abs(width),
    height: Math.abs(height),
    vertexs: drawing.vertexs.map((v) => mapVertex(v, scale)),
  }
}

export function rotateDrawing(drawing: Drawing, start: XY, end: XY): Drawing {
  const { center } = drawing
  const angle = (point: XY) => Math.atan2(point.y - center.y, point.x - center.x)
  const delta = ((angle(end) - angle(start)) * 180) / Math.PI
  if (!delta) return drawing
  const turn = (x: number, y: number) => {
    const offset = rotateVertex(x, y, center.x, center.y, delta)
    return { x: offset.x + center.x, y: offset.y + center.y }
  }
  return { ...drawing, rotate: drawing.rotate + delta, vertexs: drawing.vertexs.map((v) => mapVertex(v, turn)) }
}
