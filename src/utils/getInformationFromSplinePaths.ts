import type { Drawing, Vertex } from '@/types/type'

type SplinePoint = { x: number; y: number }

type ControlPoints = {
  current: SplinePoint
  previous?: SplinePoint
  next?: SplinePoint
}

export const line = (pointA: SplinePoint, pointB: SplinePoint) => {
  const lengthX = pointB.x - pointA.x
  const lengthY = pointB.y - pointA.y

  return {
    length: Math.sqrt(lengthX ** 2 + lengthY ** 2),
    angle: Math.atan2(lengthY, lengthX),
  }
}

const controlPoint = (controlPoints: ControlPoints): [number, number] => {
  const { current, next, previous } = controlPoints

  const p = previous || current
  const n = next || current

  const smoothing = 0.2

  const o = line(p, n)

  const angle = o.angle
  const length = o.length * smoothing

  const x = current.x + Math.cos(angle) * length
  const y = current.y + Math.sin(angle) * length

  return [x, y]
}

function splineControls(points: SplinePoint[], i: number) {
  const outgoing = controlPoint({ current: points[i - 1], previous: points[i - 2], next: points[i] })
  const incoming = controlPoint({ current: points[i], previous: points[i - 1], next: points[i + 1] })
  return { outgoing, incoming }
}

export const bezierCommand = (point: SplinePoint, i: number, points: SplinePoint[]): string => {
  const { outgoing, incoming } = splineControls(points, i)
  return `C ${outgoing} ${incoming} ${point.x}, ${point.y}`
}

export function editableVertices(drawing: Drawing): Vertex[] {
  if (drawing.type !== 'SPLINE' || drawing.vertexs[0].type !== null) return drawing.vertexs
  const vertices = drawing.vertexs.map((point, i): Vertex => ({ ...point, type: i === 0 ? 'M' : 'C' }))
  for (let i = 1; i < vertices.length; i++) {
    const { outgoing, incoming } = splineControls(vertices, i)
    ;[vertices[i - 1].nextHandlerX, vertices[i - 1].nextHandlerY] = outgoing
    ;[vertices[i].currentHandlerX, vertices[i].currentHandlerY] = incoming
  }
  return vertices
}

export const getSvgInformationFromPath = (paths: SplinePoint[]) => {
  const xValues = paths.map(({ x }) => x)
  const yValues = paths.map(({ y }) => y)
  const xMin = Math.min(...xValues) - 20
  const yMin = Math.min(...yValues) - 20
  const xMax = Math.max(...xValues) + 20
  const yMax = Math.max(...yValues) + 20
  const width = xMax - xMin
  const height = yMax - yMin

  const center = { x: (xMax + xMin) / 2, y: (yMax + yMin) / 2 }
  return {
    center,
    width,
    height,
  }
}
