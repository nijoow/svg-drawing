import { Drawing, Vertex } from '@/types/type'
import { Position, recalculateDrawingBounds } from './drawingGeometry'

const newId = () => globalThis.crypto?.randomUUID?.() ?? `vertex-${Date.now()}-${Math.random().toString(36).slice(2)}`
const closedPath = (drawing: Drawing) => drawing.type === 'POLYGON' || drawing.type === 'ELLIPSE'
const editable = (drawing: Drawing) => drawing.type !== 'IMAGE' && drawing.type !== 'TEXT'
const interpolate = (a: Position, b: Position, t: number): Position => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})
const incoming = (vertex: Vertex): Position => ({
  x: vertex.currentHandlerX ?? vertex.x,
  y: vertex.currentHandlerY ?? vertex.y,
})
const outgoing = (vertex: Vertex): Position => ({
  x: vertex.nextHandlerX ?? vertex.x,
  y: vertex.nextHandlerY ?? vertex.y,
})
const withIncoming = (vertex: Vertex, p: Position): Vertex => ({
  ...vertex,
  currentHandlerX: p.x,
  currentHandlerY: p.y,
})
const withOutgoing = (vertex: Vertex, p: Position): Vertex => ({ ...vertex, nextHandlerX: p.x, nextHandlerY: p.y })

export const setVertexCurveHandles = (vertex: Vertex, end: Position): Vertex => ({
  ...vertex,
  currentHandlerX: 2 * vertex.x - end.x,
  currentHandlerY: 2 * vertex.y - end.y,
  nextHandlerX: end.x,
  nextHandlerY: end.y,
})

/** Convert implicit smooth commands into explicit cubic handles without changing shape. */
const explicitCurves = (vertices: Vertex[], closed: boolean): Vertex[] => {
  const next = vertices.map((vertex) => ({ ...vertex }))
  for (let index = closed ? 0 : 1; index < next.length; index++) {
    const vertex = vertices[index]
    if (vertex.type !== 'S') continue
    const previousIndex = (index - 1 + vertices.length) % vertices.length
    const previous = vertices[previousIndex]
    const cp =
      previous.type === 'C' || previous.type === 'S'
        ? { x: 2 * previous.x - incoming(previous).x, y: 2 * previous.y - incoming(previous).y }
        : previous
    next[previousIndex] = withOutgoing(next[previousIndex], cp)
    next[index].type = 'C'
  }
  return next
}

/** Keep the current pencil curve identical when converting it to editable cubic segments. */
export const convertSplineToPath = (drawing: Drawing): Drawing => {
  if (drawing.type !== 'SPLINE') return drawing
  const vertices = drawing.vertexs
  const control = (current: Position, previous: Position, next: Position): Position => ({
    x: current.x + (next.x - previous.x) * 0.2,
    y: current.y + (next.y - previous.y) * 0.2,
  })
  return recalculateDrawingBounds({
    ...drawing,
    type: 'PATH',
    vertexs: vertices.map(
      (vertex, index): Vertex => ({
        ...vertex,
        type: index === 0 ? 'M' : 'C',
        currentHandlerX: control(vertex, vertices[index - 1] ?? vertex, vertices[index + 1] ?? vertex).x,
        currentHandlerY: control(vertex, vertices[index - 1] ?? vertex, vertices[index + 1] ?? vertex).y,
        nextHandlerX: control(vertex, vertices[index - 1] ?? vertex, vertices[index + 1] ?? vertex).x,
        nextHandlerY: control(vertex, vertices[index - 1] ?? vertex, vertices[index + 1] ?? vertex).y,
      }),
    ),
  })
}

/** Split the segment after the selected anchor with de Casteljau; preserve both curves exactly. */
export function splitDrawingSegment(drawing: Drawing, vertexId: string, t = 0.5): Drawing {
  if (!editable(drawing) || !(t > 0 && t < 1)) return drawing
  const base = convertSplineToPath(drawing)
  const closed = closedPath(base)
  const vertexs = explicitCurves(base.vertexs, closed)
  const index = vertexs.findIndex((vertex) => vertex.id === vertexId)
  if (index < 0 || (!closed && index === vertexs.length - 1)) return drawing
  const nextIndex = (index + 1) % vertexs.length
  const start = vertexs[index]
  const end = vertexs[nextIndex]
  let middle: Vertex
  if (end.type === 'C') {
    const a = interpolate(start, outgoing(start), t)
    const b = interpolate(outgoing(start), incoming(end), t)
    const c = interpolate(incoming(end), end, t)
    const d = interpolate(a, b, t)
    const e = interpolate(b, c, t)
    const anchor = interpolate(d, e, t)
    vertexs[index] = withOutgoing(start, a)
    vertexs[nextIndex] = withIncoming(end, c)
    middle = {
      id: newId(),
      type: 'C',
      ...anchor,
      currentHandlerX: d.x,
      currentHandlerY: d.y,
      nextHandlerX: e.x,
      nextHandlerY: e.y,
    }
  } else {
    middle = { id: newId(), type: 'L', ...interpolate(start, end, t) }
  }
  vertexs.splice(index + 1, 0, middle)
  return recalculateDrawingBounds({ ...base, type: closed ? 'POLYGON' : 'PATH', vertexs })
}

export function deleteDrawingVertex(drawing: Drawing, vertexId: string): Drawing {
  if (!editable(drawing)) return drawing
  const base = convertSplineToPath(drawing)
  const closed = closedPath(base)
  if (base.vertexs.length <= (closed ? 3 : 2) || !base.vertexs.some((vertex) => vertex.id === vertexId)) return drawing
  const vertexs = explicitCurves(base.vertexs, closed).filter((vertex) => vertex.id !== vertexId)
  if (!closed) vertexs[0] = { ...vertexs[0], type: 'M' }
  vertexs.forEach((vertex, index) => {
    if (vertex.type !== 'C') return
    const previousIndex = (index - 1 + vertexs.length) % vertexs.length
    vertexs[previousIndex] = withOutgoing(vertexs[previousIndex], outgoing(vertexs[previousIndex]))
  })
  return recalculateDrawingBounds({ ...base, type: closed ? 'POLYGON' : 'PATH', vertexs })
}

export function setDrawingVertexKind(drawing: Drawing, vertexId: string, kind: 'smooth' | 'corner'): Drawing {
  if (!editable(drawing)) return drawing
  const base = convertSplineToPath(drawing)
  const closed = closedPath(base)
  const vertexs = explicitCurves(base.vertexs, closed)
  const index = vertexs.findIndex((vertex) => vertex.id === vertexId)
  if (index < 0) return drawing
  const vertex = vertexs[index]
  const previousIndex = (index - 1 + vertexs.length) % vertexs.length
  const nextIndex = (index + 1) % vertexs.length
  const previous = !closed && index === 0 ? vertex : vertexs[previousIndex]
  const next = !closed && index === vertexs.length - 1 ? vertex : vertexs[nextIndex]
  if (kind === 'smooth') {
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y) || 1
    const direction = { x: (next.x - previous.x) / distance, y: (next.y - previous.y) / distance }
    const before = Math.hypot(vertex.x - previous.x, vertex.y - previous.y) / 3
    const after = Math.hypot(next.x - vertex.x, next.y - vertex.y) / 3
    vertexs[index] = {
      ...vertex,
      type: !closed && index === 0 ? 'M' : 'C',
      currentHandlerX: vertex.x - direction.x * before,
      currentHandlerY: vertex.y - direction.y * before,
      nextHandlerX: vertex.x + direction.x * after,
      nextHandlerY: vertex.y + direction.y * after,
    }
    if (closed || index > 0)
      vertexs[previousIndex] = withOutgoing(vertexs[previousIndex], outgoing(vertexs[previousIndex]))
    if (closed || index < vertexs.length - 1)
      vertexs[nextIndex] = { ...withIncoming(vertexs[nextIndex], incoming(vertexs[nextIndex])), type: 'C' }
  } else {
    // Collapsing only this anchor's handles makes a corner without discarding its neighbors' curvature.
    vertexs[index] = withIncoming(withOutgoing(vertex, vertex), vertex)
  }
  return recalculateDrawingBounds({ ...base, type: closed ? 'POLYGON' : 'PATH', vertexs })
}

export function straightenDrawingSegment(drawing: Drawing, vertexId: string): Drawing {
  if (!editable(drawing)) return drawing
  const base = convertSplineToPath(drawing)
  const closed = closedPath(base)
  const vertexs = explicitCurves(base.vertexs, closed)
  const index = vertexs.findIndex((vertex) => vertex.id === vertexId)
  if (index < 0 || (!closed && index === vertexs.length - 1)) return drawing
  const end = (index + 1) % vertexs.length
  vertexs[end] = { ...vertexs[end], type: 'L' }
  return recalculateDrawingBounds({ ...base, type: closed ? 'POLYGON' : 'PATH', vertexs })
}

export function toggleDrawingClosed(drawing: Drawing): Drawing {
  if (!editable(drawing)) return drawing
  const base = convertSplineToPath(drawing)
  const closed = closedPath(base)
  if (!closed && base.vertexs.length < 3) return drawing
  const vertexs = explicitCurves(base.vertexs, closed)
  vertexs[0] = { ...vertexs[0], type: closed ? 'M' : 'L' }
  return recalculateDrawingBounds({ ...base, type: closed ? 'PATH' : 'POLYGON', vertexs })
}

const squaredDistanceToSegment = (point: Position, start: Position, end: Position) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0
  return (point.x - start.x - t * dx) ** 2 + (point.y - start.y - t * dy) ** 2
}

/** Iterative RDP avoids call-stack overflow on long pencil strokes. */
export function simplifyVertices(vertices: Vertex[], tolerance: number): Vertex[] {
  if (vertices.length < 3 || !(tolerance > 0)) return vertices
  const kept = new Set([0, vertices.length - 1])
  const work = [[0, vertices.length - 1]]
  const threshold = tolerance * tolerance
  while (work.length) {
    const [first, last] = work.pop()!
    let largest = threshold
    let candidate = -1
    for (let index = first + 1; index < last; index++) {
      const distance = squaredDistanceToSegment(vertices[index], vertices[first], vertices[last])
      if (distance > largest) {
        largest = distance
        candidate = index
      }
    }
    if (candidate !== -1) {
      kept.add(candidate)
      work.push([first, candidate], [candidate, last])
    }
  }
  return Array.from(kept)
    .sort((a, b) => a - b)
    .map((index) => vertices[index])
}

export function simplifyDrawing(drawing: Drawing, tolerance: number): Drawing {
  if (drawing.type !== 'SPLINE') return drawing
  return convertSplineToPath({ ...drawing, vertexs: simplifyVertices(drawing.vertexs, tolerance) })
}
