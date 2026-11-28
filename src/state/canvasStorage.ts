import type { Drawing, Vertex } from '@/types/type'

const key = 'nijoow-drawing.canvas.v1'
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const color = (value: unknown) => typeof value === 'string' && /^(#[\da-f]{6}|transparent|none)$/i.test(value)

function vertex(value: unknown): value is Vertex {
  if (!record(value) || !finite(value.x) || !finite(value.y) || typeof value.id !== 'string') return false
  const pair = (x: unknown, y: unknown) => (x === undefined && y === undefined) || (finite(x) && finite(y))
  return (
    [null, 'M', 'L', 'C', 'S'].some((type) => type === value.type) &&
    pair(value.currentHandlerX, value.currentHandlerY) &&
    pair(value.nextHandlerX, value.nextHandlerY)
  )
}

function drawing(value: unknown): value is Drawing {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    value.subType !== null ||
    !['PATH', 'ELLIPSE', 'POLYGON', 'SPLINE'].some((type) => type === value.type) ||
    !record(value.center) ||
    !finite(value.center.x) ||
    !finite(value.center.y) ||
    !finite(value.width) ||
    value.width < 0 ||
    !finite(value.height) ||
    value.height < 0 ||
    !finite(value.rotate) ||
    !finite(value.opacity) ||
    value.opacity < 0 ||
    value.opacity > 1 ||
    !finite(value.strokeWidth) ||
    value.strokeWidth < 0 ||
    !color(value.fill) ||
    !color(value.stroke)
  )
    return false
  const points = value.vertexs
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    !points.every(vertex) ||
    new Set(points.map((v) => v.id)).size !== points.length
  )
    return false
  if (value.type === 'SPLINE' && points[0].type === null) return points.every((v) => v.type === null)
  return points.every((v, i) => {
    if (v.type === 'C' && points[(i + points.length - 1) % points.length].nextHandlerX === undefined) return false
    return v.type !== null && ((v.type !== 'C' && v.type !== 'S') || v.currentHandlerX !== undefined)
  })
}

export function loadCanvas(storage: Storage): Drawing[] | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  const data: unknown = JSON.parse(raw)
  if (
    !record(data) ||
    data.version !== 1 ||
    !Array.isArray(data.drawings) ||
    !data.drawings.every(drawing) ||
    new Set(data.drawings.map((item) => item.id)).size !== data.drawings.length
  )
    throw new Error('저장한 그림 형식을 읽을 수 없습니다.')
  return data.drawings
}

export function saveCanvas(storage: Storage, drawings: Drawing[]) {
  storage.setItem(key, JSON.stringify({ version: 1, drawings }))
}
