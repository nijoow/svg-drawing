import { getInformationFromVertexs } from './getInformationFromVertex'

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

export const bezierCommand = (point: SplinePoint, i: number, a: SplinePoint[]): string => {
  let cpsX: number
  let cpsY: number

  switch (i) {
    case 0:
      ;[cpsX, cpsY] = controlPoint({
        current: point,
      })
      break
    case 1:
      ;[cpsX, cpsY] = controlPoint({
        current: a[i - 1],
        next: point,
      })
      break
    default:
      ;[cpsX, cpsY] = controlPoint({
        current: a[i - 1],
        previous: a[i - 2],
        next: point,
      })
      break
  }

  const [cpeX, cpeY] = controlPoint({
    current: point,
    previous: a[i - 1],
    next: a[i + 1],
  })

  return `C ${cpsX},${cpsY} ${cpeX},${cpeY} ${point.x}, ${point.y}`
}

export const getSvgInformationFromPath = (paths: SplinePoint[]) => {
  const finitePaths = paths.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  const bounds = getInformationFromVertexs(finitePaths)
  if (finitePaths.length === 0) return bounds
  return { ...bounds, width: bounds.width + 40, height: bounds.height + 40 }
}
