import type paper from 'paper'
import type { Drawing, Vertex } from '@/types/type'
import { drawingToPathData } from '@/editor/document'

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude'
// Paper exposes remove() at runtime but omits it from its bundled scope typings.
type VectorScope = paper.PaperScope & { remove(): void }

export function vectorId(prefix = 'vector'): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

/** A separate, canvas-free project keeps geometry calculations out of the UI renderer. */
export async function createVectorScope(): Promise<VectorScope> {
  const imported = await import('paper')
  const Paper = imported.default ?? imported
  const scope = new Paper.PaperScope() as VectorScope
  new scope.Project(new scope.Size(1, 1))
  return scope
}

function rounded(value: number): number {
  return Math.round(value * 1000000) / 1000000
}

/** Paper's handles are relative; the editor stores both handles in document coordinates. */
export function pathVertices(path: paper.Path): Vertex[] {
  // The document format requires at least three vertices for a closed contour.
  while (path.closed && path.segments.length > 0 && path.segments.length < 3) {
    if (!path.divideAt(path.length / 3)) break
  }
  return path.segments.map((segment, index) => {
    const previous = path.segments[(index + path.segments.length - 1) % path.segments.length]
    const curved = !segment.handleIn.isZero() || !previous.handleOut.isZero()
    return {
      id: vectorId('point'),
      x: rounded(segment.point.x),
      y: rounded(segment.point.y),
      type: index === 0 && !path.closed ? 'M' : curved ? 'C' : 'L',
      currentHandlerX: rounded(segment.point.x + segment.handleIn.x),
      currentHandlerY: rounded(segment.point.y + segment.handleIn.y),
      nextHandlerX: rounded(segment.point.x + segment.handleOut.x),
      nextHandlerY: rounded(segment.point.y + segment.handleOut.y),
    }
  })
}

export function pathContours(item: paper.PathItem): paper.Path[] {
  return item.className === 'CompoundPath'
    ? ((item as paper.CompoundPath).children as paper.Path[])
    : [item as paper.Path]
}

export function paperDrawing(item: paper.PathItem, style: Partial<Drawing> = {}): Drawing | null {
  const contours = pathContours(item).filter((path) => path.segments.length >= 2 && path.length > 0.000001)
  if (!contours.length) return null
  const bounds = item.bounds
  const [vertexs, ...subpaths] = contours.map(pathVertices)
  return {
    fill: '#000000',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    ...style,
    id: vectorId(),
    type: contours.every((path) => path.closed) ? 'POLYGON' : 'PATH',
    subType: null,
    vertexs,
    ...(subpaths.length ? { subpaths } : { subpaths: undefined }),
    center: { x: rounded(bounds.center.x), y: rounded(bounds.center.y) },
    width: rounded(bounds.width),
    height: rounded(bounds.height),
    rotate: 0,
  }
}

export async function booleanDrawings(drawings: Drawing[], operation: BooleanOperation): Promise<Drawing | null> {
  if (drawings.length < 2) throw new Error('Select at least two vector objects to combine.')
  if (drawings.some((drawing) => drawing.type === 'TEXT' || drawing.type === 'IMAGE')) {
    throw new Error('Shape operations support vector paths. Remove text and images from the selection.')
  }
  if (drawings.some((drawing) => drawing.locked || drawing.hidden)) {
    throw new Error('Unlock and show every selected object before combining shapes.')
  }
  if (drawings.some((drawing) => drawing.clip)) {
    throw new Error('Release clipping masks before combining their shapes.')
  }
  const scope = await createVectorScope()
  try {
    const paths = drawings.map((drawing) => {
      const path = new scope.CompoundPath({ pathData: drawingToPathData(drawing), insert: false })
      pathContours(path).forEach((contour) => {
        contour.closed = true
      })
      path.fillRule = 'evenodd'
      // Orient holes consistently before performing non-zero winding geometry operations.
      return path.reorient(false, true)
    })
    const method = { union: 'unite', subtract: 'subtract', intersect: 'intersect', exclude: 'exclude' } as const
    let result: paper.PathItem = paths[0]
    for (const path of paths.slice(1)) result = result[method[operation]](path, { insert: false })
    result.reorient(false, true)
    const first = drawings[0]
    return paperDrawing(result, {
      fill: first.fill,
      stroke: first.stroke,
      strokeWidth: first.strokeWidth,
      opacity: first.opacity,
      gradient: first.gradient,
      blendMode: first.blendMode,
      effects: first.effects,
      groupId: first.groupId,
      artboardId: first.artboardId,
      name: {
        union: 'Combined shape',
        subtract: 'Subtracted shape',
        intersect: 'Intersection',
        exclude: 'Excluded shape',
      }[operation],
    })
  } finally {
    scope.remove()
  }
}

/** Preserve unrelated layer order and put the result at the topmost selected layer. */
export function replaceBooleanSelection(drawings: Drawing[], ids: string[], result: Drawing | null): Drawing[] {
  const selected = new Set(ids)
  const last = drawings.reduce((index, drawing, current) => (selected.has(drawing.id) ? current : index), -1)
  return drawings.flatMap((drawing, index) =>
    index === last ? (result ? [result] : []) : selected.has(drawing.id) ? [] : [drawing],
  )
}
