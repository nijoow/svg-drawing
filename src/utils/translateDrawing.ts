import type { Drawing } from '@/types/type'

export function translateDrawing(drawing: Drawing, dx: number, dy: number) {
  return {
    id: drawing.id,
    center: { x: drawing.center.x + dx, y: drawing.center.y + dy },
    vertexs: drawing.vertexs.map((v) => ({
      ...v,
      x: v.x + dx,
      y: v.y + dy,
      currentHandlerX: v.currentHandlerX === undefined ? undefined : v.currentHandlerX + dx,
      currentHandlerY: v.currentHandlerY === undefined ? undefined : v.currentHandlerY + dy,
      nextHandlerX: v.nextHandlerX === undefined ? undefined : v.nextHandlerX + dx,
      nextHandlerY: v.nextHandlerY === undefined ? undefined : v.nextHandlerY + dy,
    })),
  }
}
