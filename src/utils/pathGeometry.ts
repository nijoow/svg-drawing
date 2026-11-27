import type { Drawing, Vertex } from '@/types/type'
import { rotateVertex } from './rotateVertex.ts'

export type XY = Drawing['center']
export type Segment = {
  from: number
  to: number
  start: XY
  end: XY
  controls?: [XY, XY]
  close?: boolean
}

// The renderer starts at the last anchor for cyclic shapes. An explicit M
// starts a new subpath instead, including pen paths closed with SVG's Z.
export function pathSegments(vertices: Vertex[], polygon: boolean): Segment[] {
  const segments: Segment[] = []
  let from = vertices.length - 1
  let subpath = from
  let previousControl: XY | undefined
  for (const [to, end] of vertices.entries()) {
    const start = vertices[from]
    if (end.type === 'M') {
      subpath = to
      previousControl = undefined
    } else {
      const segment: Segment = { from, to, start, end }
      if (end.type === 'C' || end.type === 'S') {
        const first =
          end.type === 'S'
            ? { x: 2 * start.x - (previousControl?.x ?? start.x), y: 2 * start.y - (previousControl?.y ?? start.y) }
            : { x: start.nextHandlerX!, y: start.nextHandlerY! }
        segment.controls = [first, { x: end.currentHandlerX!, y: end.currentHandlerY! }]
      }
      segments.push(segment)
      previousControl = segment.controls?.[1]
    }
    from = to
  }
  if (polygon && from !== subpath)
    segments.push({ from, to: subpath, start: vertices[from], end: vertices[subpath], close: true })
  return segments
}

export function pointOnSegment({ start, end, controls }: Segment, t: number): XY {
  const s = 1 - t
  if (!controls) return { x: s * start.x + t * end.x, y: s * start.y + t * end.y }
  const [a, b] = controls
  const axis = (key: keyof XY) =>
    s ** 3 * start[key] + 3 * s * s * t * a[key] + 3 * s * t * t * b[key] + t ** 3 * end[key]
  return { x: axis('x'), y: axis('y') }
}

function extrema(start: number, a: number, b: number, end: number) {
  const d0 = a - start,
    d1 = b - a,
    d2 = end - b
  const quadratic = d0 - 2 * d1 + d2,
    linear = 2 * (d1 - d0)
  const tolerance = Number.EPSILON * Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2)) * 8
  if (Math.abs(quadratic) <= tolerance) return Math.abs(linear) <= tolerance ? [] : [-d0 / linear]
  const discriminant = linear * linear - 4 * quadratic * d0
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  return [(-linear + root) / (2 * quadratic), (-linear - root) / (2 * quadratic)]
}

export function pathBounds(drawing: Drawing, vertices: Vertex[]) {
  const { center, rotate } = drawing
  const local = (p: XY) => rotateVertex(p.x, p.y, center.x, center.y, -rotate)
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  function include(p: XY) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  for (const vertex of vertices) include(local(vertex))
  for (const segment of pathSegments(vertices, drawing.type === 'POLYGON')) {
    if (!segment.controls) continue
    const start = local(segment.start),
      end = local(segment.end)
    const controls: [XY, XY] = [local(segment.controls[0]), local(segment.controls[1])]
    for (const key of ['x', 'y'] as const) {
      for (const t of extrema(start[key], controls[0][key], controls[1][key], end[key])) {
        if (t > 0 && t < 1) include(pointOnSegment({ ...segment, start, end, controls }, t))
      }
    }
  }
  const middle = rotateVertex((minX + maxX) / 2, (minY + maxY) / 2, 0, 0, rotate)
  return { center: { x: middle.x + center.x, y: middle.y + center.y }, width: maxX - minX, height: maxY - minY }
}
