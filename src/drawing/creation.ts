import { Drawing, Options, Vertex } from '@/types/type'
import { v4 as uuid } from 'uuid'

export type ShapeKind = 'RECTANGLE' | 'ELLIPSE' | 'TRIANGLE'
export type Position = { x: number; y: number }

export function createShape(kind: ShapeKind, start: Position, end: Position, options: Options): Drawing | null {
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)
  const width = right - left
  const height = bottom - top
  if (width < 1 || height < 1) return null
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const vertex = (x: number, y: number): Vertex => ({ id: uuid(), type: 'L', x, y })
  let vertexs: Vertex[]

  if (kind === 'ELLIPSE') {
    const k = (4 * (Math.sqrt(2) - 1)) / 3
    const hx = (width / 2) * k
    const hy = (height / 2) * k
    vertexs = [
      {
        ...vertex(left, center.y),
        type: 'C',
        currentHandlerX: left,
        currentHandlerY: center.y - hy,
        nextHandlerX: left,
        nextHandlerY: center.y + hy,
      },
      {
        ...vertex(center.x, bottom),
        type: 'C',
        currentHandlerX: center.x - hx,
        currentHandlerY: bottom,
        nextHandlerX: center.x + hx,
        nextHandlerY: bottom,
      },
      {
        ...vertex(right, center.y),
        type: 'C',
        currentHandlerX: right,
        currentHandlerY: center.y + hy,
        nextHandlerX: right,
        nextHandlerY: center.y - hy,
      },
      {
        ...vertex(center.x, top),
        type: 'C',
        currentHandlerX: center.x + hx,
        currentHandlerY: top,
        nextHandlerX: center.x - hx,
        nextHandlerY: top,
      },
    ]
  } else if (kind === 'TRIANGLE') {
    vertexs = [vertex(center.x, top), vertex(left, bottom), vertex(right, bottom)]
  } else {
    vertexs = [vertex(left, top), vertex(left, bottom), vertex(right, bottom), vertex(right, top)]
  }

  return {
    id: uuid(),
    type: kind === 'ELLIPSE' ? 'ELLIPSE' : 'POLYGON',
    subType: null,
    vertexs,
    width,
    height,
    center,
    rotate: 0,
    ...options,
  }
}
