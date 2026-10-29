import { getInformationFromVertexs } from './getInformationFromVertex'

type SplinePoint = { x: number; y: number }

export const line = (pointA: SplinePoint, pointB: SplinePoint) => {
  const lengthX = pointB.x - pointA.x
  const lengthY = pointB.y - pointA.y

  return {
    length: Math.sqrt(lengthX ** 2 + lengthY ** 2),
    angle: Math.atan2(lengthY, lengthX),
  }
}

/** One smoothing rule for live pencil previews, document paths and editable handles. */
export const splineControlPoint = (current: SplinePoint, previous = current, next = current): SplinePoint => ({
  x: current.x + (next.x - previous.x) * 0.2,
  y: current.y + (next.y - previous.y) * 0.2,
})

export const bezierCommand = (point: SplinePoint, i: number, a: SplinePoint[]): string => {
  const start = i === 0 ? splineControlPoint(point) : splineControlPoint(a[i - 1], a[i - 2], point)
  const end = splineControlPoint(point, a[i - 1], a[i + 1])
  return `C ${start.x},${start.y} ${end.x},${end.y} ${point.x}, ${point.y}`
}

export const getSvgInformationFromPath = (paths: SplinePoint[]) => {
  const finitePaths = paths.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  const bounds = getInformationFromVertexs(finitePaths)
  if (finitePaths.length === 0) return bounds
  return { ...bounds, width: bounds.width + 40, height: bounds.height + 40 }
}
