import { Direction, Drawing, Vertex } from '@/types/type'
import { getInformationFromVertexs } from './getInformationFromVertex'
import { rotateVertex } from './rotateVertex'

export type Position = { x: number; y: number }
export type VertexHandle = 'VERTEX' | 'CURRENT' | 'NEXT'
export type LayerOrder = 'front' | 'back' | 'forward' | 'backward'
export type GeometryBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  center: Position
}

/** Transform anchors and both control handles, including coordinates equal to zero. */
export const transformVertex = (vertex: Vertex, transform: (x: number, y: number) => Position): Vertex => {
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

/** Compound paths and attached masks live in the same document coordinate system. */
export const transformDrawingGeometry = (drawing: Drawing, transform: (x: number, y: number) => Position): Drawing => {
  const contour = (vertices: Vertex[]) => vertices.map((vertex) => transformVertex(vertex, transform))
  return {
    ...drawing,
    vertexs: contour(drawing.vertexs),
    ...(drawing.subpaths ? { subpaths: drawing.subpaths.map(contour) } : {}),
    ...(drawing.clip
      ? {
          clip: {
            vertexs: contour(drawing.clip.vertexs),
            ...(drawing.clip.subpaths ? { subpaths: drawing.clip.subpaths.map(contour) } : {}),
          },
        }
      : {}),
  }
}

export const translateDrawing = (drawing: Drawing, deltaX: number, deltaY: number): Drawing => ({
  ...transformDrawingGeometry(drawing, (x, y) => ({ x: x + deltaX, y: y + deltaY })),
  center: { x: drawing.center.x + deltaX, y: drawing.center.y + deltaY },
})

export const rotateDrawingAround = (drawing: Drawing, angle: number, origin: Position): Drawing => {
  const rotate = (x: number, y: number) => {
    const point = rotateVertex(x, y, origin.x, origin.y, angle)
    return { x: point.x + origin.x, y: point.y + origin.y }
  }
  return {
    ...transformDrawingGeometry(drawing, rotate),
    rotate: (drawing.rotate + angle) % 360,
    center: rotate(drawing.center.x, drawing.center.y),
  }
}

export const rotateDrawing = (drawing: Drawing, angle: number): Drawing =>
  rotateDrawingAround(drawing, angle, drawing.center)

export const resizeDrawing = (
  drawing: Drawing,
  direction: Direction,
  start: Position,
  end: Position,
  proportional = false,
): Drawing => {
  if (!direction) return drawing
  const from = rotateVertex(start.x, start.y, drawing.center.x, drawing.center.y, -drawing.rotate)
  const to = rotateVertex(end.x, end.y, drawing.center.x, drawing.center.y, -drawing.rotate)
  const deltaX = (to.x - from.x) * 2
  const deltaY = (to.y - from.y) * 2
  let scaleX =
    drawing.width === 0
      ? 1
      : 1 + (direction.includes('L') ? -deltaX : direction.includes('R') ? deltaX : 0) / drawing.width
  let scaleY =
    drawing.height === 0
      ? 1
      : 1 + (direction.includes('T') ? -deltaY : direction.includes('B') ? deltaY : 0) / drawing.height
  if (proportional) {
    const scale =
      direction === 'T' || direction === 'B'
        ? scaleY
        : direction === 'L' || direction === 'R'
        ? scaleX
        : Math.abs(scaleX - 1) >= Math.abs(scaleY - 1)
        ? scaleX
        : scaleY
    scaleX = scale
    scaleY = scale
  }
  // Flat paths retain their zero extent, with no division by zero.
  return {
    ...transformDrawingGeometry(drawing, (x, y) => {
      const local = rotateVertex(x, y, drawing.center.x, drawing.center.y, -drawing.rotate)
      const next = rotateVertex(local.x * scaleX, local.y * scaleY, 0, 0, drawing.rotate)
      return { x: next.x + drawing.center.x, y: next.y + drawing.center.y }
    }),
    width: Math.abs(drawing.width * scaleX),
    height: Math.abs(drawing.height * scaleY),
  }
}

export const cubicPoint = (a: Position, b: Position, c: Position, d: Position, t: number): Position => {
  const s = 1 - t
  return {
    x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y,
  }
}

const cubicExtrema = (a: number, b: number, c: number, d: number): number[] => {
  const quadratic = -a + 3 * b - 3 * c + d
  const linear = 2 * (a - 2 * b + c)
  const constant = b - a
  if (Math.abs(quadratic) < 1e-12)
    return Math.abs(linear) < 1e-12 ? [] : [-constant / linear].filter((t) => t > 0 && t < 1)
  const discriminant = linear * linear - 4 * quadratic * constant
  if (discriminant < 0) return []
  return [
    (-linear + Math.sqrt(discriminant)) / (2 * quadratic),
    (-linear - Math.sqrt(discriminant)) / (2 * quadratic),
  ].filter((t) => t > 0 && t < 1)
}

/** Exact cubic extrema, unlike an anchor-only or control-hull bounding box. */
export const contourBoundsPoints = (vertices: Vertex[], closed: boolean): Position[] => {
  const points: Position[] = vertices.map(({ x, y }) => ({ x, y }))
  for (let index = closed ? 0 : 1; index < vertices.length; index++) {
    const end = vertices[index]
    const start = vertices[(index - 1 + vertices.length) % vertices.length]
    if (end.type !== 'C' && end.type !== 'S') continue
    const cp1 =
      end.type === 'S' && (start.type === 'C' || start.type === 'S')
        ? { x: 2 * start.x - (start.currentHandlerX ?? start.x), y: 2 * start.y - (start.currentHandlerY ?? start.y) }
        : end.type === 'S'
        ? start
        : { x: start.nextHandlerX ?? start.x, y: start.nextHandlerY ?? start.y }
    const cp2 = { x: end.currentHandlerX ?? end.x, y: end.currentHandlerY ?? end.y }
    const roots = [...cubicExtrema(start.x, cp1.x, cp2.x, end.x), ...cubicExtrema(start.y, cp1.y, cp2.y, end.y)]
    roots.forEach((t) => points.push(cubicPoint(start, cp1, cp2, end, t)))
  }
  return points
}

export const recalculateDrawingBounds = (drawing: Drawing): Drawing => {
  const unrotate = (x: number, y: number) => rotateVertex(x, y, drawing.center.x, drawing.center.y, -drawing.rotate)
  const contours = [drawing.vertexs, ...(drawing.subpaths ?? [])].map((vertices) =>
    vertices.map((v) => transformVertex(v, unrotate)),
  )
  const points = contours.flatMap((vertices, index) =>
    contourBoundsPoints(vertices, index > 0 || drawing.type === 'POLYGON' || drawing.type === 'ELLIPSE'),
  )
  if (!points.length) return drawing
  const bounds = getInformationFromVertexs(points)
  const center = rotateVertex(bounds.center.x, bounds.center.y, 0, 0, drawing.rotate)
  return {
    ...drawing,
    width: bounds.width,
    height: bounds.height,
    center: { x: center.x + drawing.center.x, y: center.y + drawing.center.y },
  }
}

export const moveDrawingVertex = (
  drawing: Drawing,
  vertexId: string,
  handle: VertexHandle,
  deltaX: number,
  deltaY: number,
): Drawing => {
  const update = (vertex: Vertex): Vertex => {
    if (vertex.id !== vertexId) return vertex
    if (handle === 'VERTEX') return transformVertex(vertex, (x, y) => ({ x: x + deltaX, y: y + deltaY }))
    if (handle === 'CURRENT')
      return {
        ...vertex,
        currentHandlerX: (vertex.currentHandlerX ?? vertex.x) + deltaX,
        currentHandlerY: (vertex.currentHandlerY ?? vertex.y) + deltaY,
      }
    return {
      ...vertex,
      nextHandlerX: (vertex.nextHandlerX ?? vertex.x) + deltaX,
      nextHandlerY: (vertex.nextHandlerY ?? vertex.y) + deltaY,
    }
  }
  return recalculateDrawingBounds({
    ...drawing,
    type: drawing.type === 'ELLIPSE' ? 'POLYGON' : drawing.type,
    vertexs: drawing.vertexs.map(update),
    ...(drawing.subpaths ? { subpaths: drawing.subpaths.map((vertices) => vertices.map(update)) } : {}),
  })
}

export const getSelectionBounds = (drawings: Drawing[]): GeometryBounds => {
  const points = drawings.flatMap((drawing) =>
    [
      { x: -drawing.width / 2, y: -drawing.height / 2 },
      { x: drawing.width / 2, y: -drawing.height / 2 },
      { x: drawing.width / 2, y: drawing.height / 2 },
      { x: -drawing.width / 2, y: drawing.height / 2 },
    ].map((point) => {
      const rotated = rotateVertex(point.x, point.y, 0, 0, drawing.rotate)
      return { x: rotated.x + drawing.center.x, y: rotated.y + drawing.center.y }
    }),
  )
  const { width, height, center } = getInformationFromVertexs(points)
  return {
    width,
    height,
    center,
    minX: center.x - width / 2,
    minY: center.y - height / 2,
    maxX: center.x + width / 2,
    maxY: center.y + height / 2,
  }
}

export const resizeDrawings = (
  drawings: Drawing[],
  direction: Direction,
  start: Position,
  end: Position,
  proportional = false,
): Drawing[] => {
  if (!drawings.length || !direction) return drawings
  const bounds = getSelectionBounds(drawings)
  const frame = { ...drawings[0], ...bounds, rotate: 0, vertexs: [], subpaths: undefined, clip: undefined }
  // A nonuniform transform of a rotated text/image rectangle would introduce shear,
  // which the rectangle model cannot represent. Keep those groups proportional.
  const preserveRectangles = drawings.some(
    (drawing) =>
      (drawing.type === 'TEXT' || drawing.type === 'IMAGE') &&
      Math.abs(Math.sin((drawing.rotate * Math.PI) / 90)) > 1e-8,
  )
  const resized = resizeDrawing(frame, direction, start, end, proportional || preserveRectangles)
  const sx = bounds.width ? resized.width / bounds.width : 1
  const sy = bounds.height ? resized.height / bounds.height : 1
  return drawings.map((drawing) => {
    const next = transformDrawingGeometry(drawing, (x, y) => ({
      x: bounds.center.x + (x - bounds.center.x) * sx,
      y: bounds.center.y + (y - bounds.center.y) * sy,
    }))
    const angle = (drawing.rotate * Math.PI) / 180
    return recalculateDrawingBounds({
      ...next,
      center: {
        x: bounds.center.x + (drawing.center.x - bounds.center.x) * sx,
        y: bounds.center.y + (drawing.center.y - bounds.center.y) * sy,
      },
      rotate: (Math.atan2(Math.sin(angle) * sy, Math.cos(angle) * sx) * 180) / Math.PI,
    })
  })
}

export const reorderDrawing = (drawings: Drawing[], id: string, order: LayerOrder): Drawing[] => {
  const index = drawings.findIndex((drawing) => drawing.id === id)
  if (index === -1) return drawings
  const target = {
    front: drawings.length - 1,
    back: 0,
    forward: Math.min(index + 1, drawings.length - 1),
    backward: Math.max(index - 1, 0),
  }[order]
  if (target === index) return drawings
  const next = [...drawings]
  const [drawing] = next.splice(index, 1)
  next.splice(target, 0, drawing)
  return next
}
