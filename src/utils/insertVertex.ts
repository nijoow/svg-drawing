import type { Vertex } from '@/types/type'
import { pathSegments, pointOnSegment, type Segment, type XY } from './pathGeometry.ts'

function lerp(a: XY, b: XY, t: number): XY {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function nearestParameter(segment: Segment, point: XY) {
  const { start, end } = segment
  if (!segment.controls) {
    const dx = end.x - start.x,
      dy = end.y - start.y
    return Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)))
  }
  const distance = (t: number) => {
    const p = pointOnSegment(segment, t)
    return (p.x - point.x) ** 2 + (p.y - point.y) ** 2
  }
  // Search each sampled valley, including those next to either endpoint.
  const steps = 32
  const samples = Array.from({ length: steps + 1 }, (_, i) => distance(i / steps))
  let best = samples[0] <= samples[steps] ? 0 : 1
  for (let i = 0; i <= steps; i++) {
    if (samples[i] > (samples[i - 1] ?? Infinity) || samples[i] > (samples[i + 1] ?? Infinity)) continue
    let lo = Math.max(0, (i - 1) / steps),
      hi = Math.min(1, (i + 1) / steps)
    for (let j = 0; j < 30; j++) {
      const a = lo + (hi - lo) / 3,
        b = hi - (hi - lo) / 3
      if (distance(a) < distance(b)) hi = b
      else lo = a
    }
    const t = (lo + hi) / 2
    if (distance(t) < distance(best)) best = t
  }
  return best
}

export function splitSegment(vertices: Vertex[], polygon: boolean, segment: Segment, t: number, id: string): Vertex[] {
  if (!(t > 0 && t < 1)) return vertices
  const next = vertices.map((v) => ({ ...v }))
  // An S after a split would reflect the shortened handle of its predecessor.
  // Make its original reflected control explicit before changing either side.
  if (vertices.some((v) => v.type === 'S')) {
    for (const curve of pathSegments(vertices, polygon)) {
      if (vertices[curve.to].type !== 'S' || !curve.controls) continue
      const [first] = curve.controls
      Object.assign(next[curve.from], { nextHandlerX: first.x, nextHandlerY: first.y })
      next[curve.to].type = 'C'
    }
  }
  const { start, end, controls, from, to } = segment
  let added: Vertex = { id, type: 'L', ...lerp(start, end, t) }
  if (controls) {
    const a = lerp(start, controls[0], t),
      b = lerp(controls[0], controls[1], t),
      c = lerp(controls[1], end, t)
    const left = lerp(a, b, t),
      right = lerp(b, c, t)
    Object.assign(next[from], { nextHandlerX: a.x, nextHandlerY: a.y })
    Object.assign(next[to], { type: 'C', currentHandlerX: c.x, currentHandlerY: c.y })
    added = {
      id,
      type: 'C',
      ...lerp(left, right, t),
      currentHandlerX: left.x,
      currentHandlerY: left.y,
      nextHandlerX: right.x,
      nextHandlerY: right.y,
    }
  }
  next.splice(segment.close ? next.length : to, 0, added)
  return next
}
