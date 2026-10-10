import type { Drawing } from '../types/type'
import type { EditorDocument } from './document'
import { resizeDrawing, rotateDrawing, translateDrawing } from '../utils/drawingGeometry'
import { cleanEmptyGroups } from './operations'
export { reorderDocumentSelection } from './operations'

export type GeometryField = 'x' | 'y' | 'width' | 'height' | 'rotate'

/** Numeric resizing uses the object's local axes, including rotated paths. */
export function changeDrawingGeometry(drawing: Drawing, field: GeometryField, value: number): Drawing {
  if (!Number.isFinite(value)) return drawing
  if (field === 'x') return translateDrawing(drawing, value - (drawing.center.x - drawing.width / 2), 0)
  if (field === 'y') return translateDrawing(drawing, 0, value - (drawing.center.y - drawing.height / 2))
  if (field === 'rotate') return rotateDrawing(drawing, value - drawing.rotate)
  if (value <= 0 || drawing[field] === 0) return drawing
  const delta = (value - drawing[field]) / 2
  const angle = (drawing.rotate * Math.PI) / 180
  const x = field === 'width' ? delta * Math.cos(angle) : -delta * Math.sin(angle)
  const y = field === 'width' ? delta * Math.sin(angle) : delta * Math.cos(angle)
  return resizeDrawing(drawing, field === 'width' ? 'R' : 'B', drawing.center, {
    x: drawing.center.x + x,
    y: drawing.center.y + y,
  })
}

export function groupDrawingIds(document: EditorDocument, groupId: string): string[] {
  const groups = new Set([groupId])
  // Documents are validated as a tree. The set also bounds malformed input safely.
  let changed = true
  while (changed) {
    changed = false
    document.groups.forEach((group) => {
      if (group.parentId && groups.has(group.parentId) && !groups.has(group.id)) {
        groups.add(group.id)
        changed = true
      }
    })
  }
  return document.drawings.filter((drawing) => drawing.groupId && groups.has(drawing.groupId)).map(({ id }) => id)
}

/** Move selected layers one level while preserving the order inside the selection. */
export function reorderSelection(drawings: Drawing[], ids: string[], direction: 'up' | 'down'): Drawing[] {
  const selected = new Set(ids)
  const next = [...drawings]
  if (direction === 'up') {
    for (let index = next.length - 2; index >= 0; index--) {
      if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      }
    }
  } else {
    for (let index = 1; index < next.length; index++) {
      if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
        ;[next[index], next[index - 1]] = [next[index - 1], next[index]]
      }
    }
  }
  return next.every((drawing, index) => drawing === drawings[index]) ? drawings : next
}

export function maskSource(drawings: Drawing[]): Drawing | undefined {
  if (drawings.length < 2) return undefined
  const source = drawings[drawings.length - 1]
  return !source.hidden && !source.locked && ['POLYGON', 'ELLIPSE'].includes(source.type) ? source : undefined
}

export function applySelectionMask(document: EditorDocument, ids: string[]): EditorDocument {
  const selected = document.drawings.filter((drawing) => ids.includes(drawing.id) && !drawing.locked && !drawing.hidden)
  const source = maskSource(selected)
  if (!source) return document
  const targets = new Set(selected.filter((drawing) => drawing.id !== source.id).map(({ id }) => id))
  return cleanEmptyGroups({
    ...document,
    drawings: document.drawings
      .filter((drawing) => drawing.id !== source.id)
      .map((drawing) =>
        targets.has(drawing.id)
          ? {
              ...drawing,
              clip: {
                vertexs: source.vertexs.map((vertex) => ({ ...vertex })),
                ...(source.subpaths
                  ? { subpaths: source.subpaths.map((path) => path.map((vertex) => ({ ...vertex }))) }
                  : {}),
              },
            }
          : drawing,
      ),
  })
}

export function removeArtboard(document: EditorDocument, id: string): EditorDocument {
  return {
    ...document,
    artboards: document.artboards.filter((board) => board.id !== id),
    drawings: document.drawings.map((drawing) => {
      if (drawing.artboardId !== id) return drawing
      const { artboardId: _artboardId, ...rest } = drawing
      return rest
    }),
  }
}
