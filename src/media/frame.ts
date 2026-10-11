import { Drawing, Vertex } from '@/types/type'
import { v4 as uuid } from 'uuid'
import { transformVertex } from '@/utils/drawingGeometry'

export type MediaPosition = { x: number; y: number }

export function rectangleVertices(position: MediaPosition, width: number, height: number): Vertex[] {
  return [
    { x: position.x, y: position.y },
    { x: position.x, y: position.y + height },
    { x: position.x + width, y: position.y + height },
    { x: position.x + width, y: position.y },
  ].map((point) => ({ ...point, id: uuid(), type: 'L' }))
}

/** Keep the visible top-left corner and local axes, including reflected frames. */
export function resizeMediaFrame(drawing: Drawing, width: number, height: number): Drawing {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return drawing
  const radians = (drawing.rotate * Math.PI) / 180
  const fallbackX = { x: Math.cos(radians), y: Math.sin(radians) }
  const fallbackY = { x: -Math.sin(radians), y: Math.cos(radians) }
  const origin = drawing.vertexs[0] ?? {
    x: drawing.center.x - (fallbackX.x * drawing.width + fallbackY.x * drawing.height) / 2,
    y: drawing.center.y - (fallbackX.y * drawing.width + fallbackY.y * drawing.height) / 2,
  }
  const axis = (vertex: Vertex | undefined, fallback: MediaPosition) => {
    const x = vertex ? vertex.x - origin.x : 0
    const y = vertex ? vertex.y - origin.y : 0
    const length = Math.hypot(x, y)
    return length > 0 ? { x: x / length, y: y / length } : fallback
  }
  const xAxis = axis(drawing.vertexs[3], fallbackX)
  const yAxis = axis(drawing.vertexs[1], fallbackY)
  const point = (x: number, y: number) => ({
    x: origin.x + xAxis.x * x + yAxis.x * y,
    y: origin.y + xAxis.y * x + yAxis.y * y,
  })
  const vertexs = [point(0, 0), point(0, height), point(width, height), point(width, 0)].map((vertex, index) => ({
    ...vertex,
    id: drawing.vertexs[index]?.id ?? uuid(),
    type: 'L' as const,
  }))
  const transformClip = (vertex: Vertex) =>
    transformVertex(vertex, (x, y) => {
      const dx = x - origin.x
      const dy = y - origin.y
      // Rectangle axes are perpendicular, so projection recovers local coordinates.
      const localX = dx * xAxis.x + dy * xAxis.y
      const localY = dx * yAxis.x + dy * yAxis.y
      return point(
        (localX * width) / Math.max(drawing.width, 0.0001),
        (localY * height) / Math.max(drawing.height, 0.0001),
      )
    })
  return {
    ...drawing,
    width,
    height,
    center: point(width / 2, height / 2),
    vertexs,
    ...(drawing.clip
      ? {
          clip: {
            ...drawing.clip,
            vertexs: drawing.clip.vertexs.map(transformClip),
            ...(drawing.clip.subpaths
              ? { subpaths: drawing.clip.subpaths.map((path) => path.map(transformClip)) }
              : {}),
          },
        }
      : {}),
  }
}
