import type { Drawing } from '../types/type'
import { getDrawingBounds, type DrawingBounds, type EditorDocument } from './document'
import { translateDrawing } from '../utils/drawingGeometry'

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type Distribution = 'horizontal' | 'vertical'
export type StackDirection = 'front' | 'back' | 'up' | 'down'
type Group = EditorDocument['groups'][number]
export type IdFactory = () => string
export interface SelectionEdit {
  document: EditorDocument
  selection: string[]
}
export interface ClipboardContent {
  drawings: Drawing[]
  groups: Group[]
}

export const newEditorId: IdFactory = () =>
  globalThis.crypto?.randomUUID?.() ?? `object-${Date.now()}-${Math.random().toString(36).slice(2)}`

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const editable = (drawing: Drawing) => !drawing.hidden && !drawing.locked
const groupIndexes = new WeakMap<Group[], Map<string, Group>>()

function groupIndex(document: EditorDocument): Map<string, Group> {
  const groups = document.groups
  if (!groups) return new Map()
  let index = groupIndexes.get(groups)
  if (!index) {
    index = new Map(groups.map((group) => [group.id, group]))
    groupIndexes.set(groups, index)
  }
  return index
}

function ancestors(document: EditorDocument, groupId?: string): string[] {
  const result: string[] = []
  const groups = groupIndex(document)
  let current = groupId
  while (current && !result.includes(current) && groups.has(current)) {
    result.push(current)
    current = groups.get(current)?.parentId
  }
  return result
}

/** Resolve both group and drawing IDs, filtering unavailable objects in stacking order. */
export function expandSelection(document: EditorDocument, ids: readonly string[]): string[] {
  const requested = new Set(ids)
  return document.drawings
    .filter(
      (drawing) =>
        editable(drawing) &&
        (requested.has(drawing.id) || ancestors(document, drawing.groupId).some((id) => requested.has(id))),
    )
    .map((drawing) => drawing.id)
}

/** Clicking a grouped object selects its outermost group; layers can select individual members. */
export function selectionForDrawing(document: EditorDocument, drawingId: string, individual = false): string[] {
  const drawing = document.drawings.find((item) => item.id === drawingId)
  if (!drawing || !editable(drawing)) return []
  const chain = ancestors(document, drawing.groupId)
  return expandSelection(document, [individual || !chain.length ? drawingId : chain[chain.length - 1]])
}

export function getSelectionBounds(document: EditorDocument, ids: readonly string[]): DrawingBounds | null {
  const selected = new Set(expandSelection(document, ids))
  const bounds = document.drawings.filter((drawing) => selected.has(drawing.id)).map(getDrawingBounds)
  return combineBounds(bounds)
}

function combineBounds(bounds: DrawingBounds[]): DrawingBounds | null {
  if (!bounds.length) return null
  const minX = Math.min(...bounds.map((bound) => bound.minX))
  const minY = Math.min(...bounds.map((bound) => bound.minY))
  const maxX = Math.max(...bounds.map((bound) => bound.maxX))
  const maxY = Math.max(...bounds.map((bound) => bound.maxY))
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** Keep every ancestor still needed by an object, removing empty groups after deletion. */
export function cleanEmptyGroups(document: EditorDocument): EditorDocument {
  const used = new Set<string>()
  document.drawings.forEach((drawing) => ancestors(document, drawing.groupId).forEach((id) => used.add(id)))
  const groups = (document.groups ?? []).filter((group) => used.has(group.id))
  return groups.length === (document.groups ?? []).length ? document : { ...document, groups }
}

export function deleteSelection(document: EditorDocument, ids: readonly string[]): SelectionEdit {
  const selected = new Set(expandSelection(document, ids))
  if (!selected.size) return { document, selection: [] }
  return {
    document: cleanEmptyGroups({
      ...document,
      drawings: document.drawings.filter((drawing) => !selected.has(drawing.id)),
    }),
    selection: [],
  }
}

export function copySelection(document: EditorDocument, ids: readonly string[]): ClipboardContent | null {
  const selected = new Set(expandSelection(document, ids))
  const drawings = document.drawings.filter((drawing) => selected.has(drawing.id))
  if (!drawings.length) return null
  const includedGroups = new Set<string>()
  drawings.forEach((drawing) => ancestors(document, drawing.groupId).forEach((id) => includedGroups.add(id)))
  return clone({ drawings, groups: (document.groups ?? []).filter((group) => includedGroups.has(group.id)) })
}

export function pasteSelection(
  document: EditorDocument,
  clipboard: ClipboardContent | null,
  offset = 24,
  idFactory: IdFactory = newEditorId,
): SelectionEdit {
  if (!clipboard?.drawings.length) return { document, selection: [] }
  const content = clone(clipboard)
  const groupIds = new Map(content.groups.map((group) => [group.id, idFactory()]))
  const groups = content.groups.map((group) => ({
    ...group,
    id: groupIds.get(group.id)!,
    parentId: group.parentId ? groupIds.get(group.parentId) : undefined,
  }))
  const drawings = content.drawings.map((drawing) => {
    const remapVertices = (vertices: Drawing['vertexs']) => vertices.map((vertex) => ({ ...vertex, id: idFactory() }))
    const pasted = translateDrawing(
      {
        ...drawing,
        id: idFactory(),
        groupId: drawing.groupId ? groupIds.get(drawing.groupId) : undefined,
        artboardId: document.artboards?.some((artboard) => artboard.id === drawing.artboardId)
          ? drawing.artboardId
          : undefined,
        vertexs: remapVertices(drawing.vertexs),
        ...(drawing.subpaths ? { subpaths: drawing.subpaths.map(remapVertices) } : {}),
        ...(drawing.clip
          ? {
              clip: {
                ...drawing.clip,
                vertexs: remapVertices(drawing.clip.vertexs),
                ...(drawing.clip.subpaths ? { subpaths: drawing.clip.subpaths.map(remapVertices) } : {}),
              },
            }
          : {}),
      },
      offset,
      offset,
    )
    return pasted
  })
  return {
    document: {
      ...document,
      groups: [...(document.groups ?? []), ...groups],
      drawings: [...document.drawings, ...drawings],
    },
    selection: drawings.map((drawing) => drawing.id),
  }
}

export function duplicateSelection(
  document: EditorDocument,
  ids: readonly string[],
  idFactory: IdFactory = newEditorId,
): SelectionEdit {
  return pasteSelection(document, copySelection(document, ids), 24, idFactory)
}

function fullySelectedGroups(document: EditorDocument, selected: Set<string>): Set<string> {
  return new Set(
    (document.groups ?? [])
      .filter((group) => {
        const members = document.drawings.filter((drawing) => ancestors(document, drawing.groupId).includes(group.id))
        return members.length > 0 && members.every((drawing) => selected.has(drawing.id))
      })
      .map((group) => group.id),
  )
}

/** A group's children occupy one stacking block, matching the visible layer tree. */
export function normalizeGroupStacking(document: EditorDocument): EditorDocument {
  if (!document.groups.length) return document
  const drawingIndex = new Map(document.drawings.map((drawing, index) => [drawing.id, index]))
  const groupTop = new Map<string, number>()
  document.drawings.forEach((drawing, index) => {
    ancestors(document, drawing.groupId).forEach((id) => groupTop.set(id, index))
  })
  const visited = new Set<string>()
  const level = (parentId?: string): Drawing[] => {
    const entries = [
      ...document.drawings
        .filter((drawing) => drawing.groupId === parentId)
        .map((drawing) => ({
          drawing,
          index: drawingIndex.get(drawing.id)!,
          groupId: undefined as string | undefined,
        })),
      ...document.groups
        .filter((group) => group.parentId === parentId && groupTop.has(group.id))
        .map((group) => ({
          drawing: undefined as Drawing | undefined,
          index: groupTop.get(group.id)!,
          groupId: group.id,
        })),
    ].sort((a, b) => a.index - b.index)
    return entries.flatMap((entry) => {
      if (entry.drawing) return [entry.drawing]
      if (!entry.groupId || visited.has(entry.groupId)) return []
      visited.add(entry.groupId)
      return level(entry.groupId)
    })
  }
  const drawings = level()
  // Do not repair malformed references by dropping content; validation reports them.
  if (
    drawings.length !== document.drawings.length ||
    drawings.every((drawing, index) => drawing === document.drawings[index])
  )
    return document
  return { ...document, drawings }
}

/** Reorder siblings in the layer tree; complete selected groups remain indivisible. */
export function reorderDocumentSelection(
  document: EditorDocument,
  ids: readonly string[],
  direction: StackDirection,
): EditorDocument {
  const selected = new Set(expandSelection(document, ids))
  if (!selected.size) return document
  const normalized = normalizeGroupStacking(document)
  const completeGroups = fullySelectedGroups(normalized, selected)
  const groupTop = new Map<string, number>()
  normalized.drawings.forEach((drawing, index) => {
    ancestors(normalized, drawing.groupId).forEach((id) => groupTop.set(id, index))
  })
  const visited = new Set<string>()
  const level = (parentId?: string): Drawing[] => {
    let entries = [
      ...normalized.drawings
        .map((drawing, index) => ({
          drawing,
          index,
          groupId: undefined as string | undefined,
          selected: selected.has(drawing.id),
        }))
        .filter(({ drawing }) => drawing.groupId === parentId),
      ...normalized.groups
        .filter((group) => group.parentId === parentId && groupTop.has(group.id))
        .map((group) => ({
          drawing: undefined as Drawing | undefined,
          index: groupTop.get(group.id)!,
          groupId: group.id,
          selected: completeGroups.has(group.id),
        })),
    ].sort((a, b) => a.index - b.index)
    if (direction === 'front') {
      entries = [...entries.filter((entry) => !entry.selected), ...entries.filter((entry) => entry.selected)]
    } else if (direction === 'back') {
      entries = [...entries.filter((entry) => entry.selected), ...entries.filter((entry) => !entry.selected)]
    } else if (direction === 'up') {
      for (let index = entries.length - 2; index >= 0; index--) {
        if (entries[index].selected && !entries[index + 1].selected) {
          ;[entries[index], entries[index + 1]] = [entries[index + 1], entries[index]]
        }
      }
    } else {
      for (let index = 1; index < entries.length; index++) {
        if (entries[index].selected && !entries[index - 1].selected) {
          ;[entries[index], entries[index - 1]] = [entries[index - 1], entries[index]]
        }
      }
    }
    return entries.flatMap((entry) => {
      if (entry.drawing) return [entry.drawing]
      if (!entry.groupId || visited.has(entry.groupId)) return []
      visited.add(entry.groupId)
      return level(entry.groupId)
    })
  }
  const drawings = level()
  if (
    drawings.length !== document.drawings.length ||
    drawings.every((drawing, index) => drawing === document.drawings[index])
  )
    return document
  return { ...document, drawings }
}

export function groupSelection(
  document: EditorDocument,
  ids: readonly string[],
  idFactory: IdFactory = newEditorId,
): SelectionEdit {
  const selection = expandSelection(document, ids)
  if (selection.length < 2) return { document, selection }
  const selected = new Set(selection)
  const fullGroups = fullySelectedGroups(document, selected)
  const roots = (document.groups ?? []).filter(
    (group) => fullGroups.has(group.id) && !ancestors(document, group.parentId).some((id) => fullGroups.has(id)),
  )
  const rootIds = new Set(roots.map((group) => group.id))
  const ungrouped = document.drawings.filter(
    (drawing) => selected.has(drawing.id) && !ancestors(document, drawing.groupId).some((id) => rootIds.has(id)),
  )
  // Grouping an already complete single group is a no-op, avoiding empty wrapper levels.
  if (roots.length === 1 && !ungrouped.length) return { document, selection }
  const chains = [
    ...roots.map((group) => ancestors(document, group.parentId)),
    ...ungrouped.map((drawing) => ancestors(document, drawing.groupId)),
  ]
  const parentId = chains[0]?.find((candidate) => chains.every((chain) => chain.includes(candidate)))
  // A hidden/locked member must not cause a selected ancestor to be silently
  // split when grouping with another branch. A subgroup inside that ancestor is safe.
  const crossing = new Set<string>()
  chains.forEach((chain) => {
    for (const ancestor of chain) {
      if (ancestor === parentId) break
      crossing.add(ancestor)
    }
  })
  if (
    document.drawings.some(
      (drawing) => !editable(drawing) && ancestors(document, drawing.groupId).some((id) => crossing.has(id)),
    )
  )
    return { document, selection }
  const id = idFactory()
  const groups = (document.groups ?? []).map((group) => (rootIds.has(group.id) ? { ...group, parentId: id } : group))
  groups.push({ id, name: `Group ${(document.groups ?? []).length + 1}`, ...(parentId ? { parentId } : {}) })
  const ungroupedIds = new Set(ungrouped.map((drawing) => drawing.id))
  const updated = document.drawings.map((drawing) =>
    ungroupedIds.has(drawing.id) ? { ...drawing, groupId: id } : drawing,
  )
  const members = updated.filter((drawing) => selected.has(drawing.id))
  const lastMember = members[members.length - 1].id
  // Insert the selected block where its highest member lived, retaining the
  // selected objects' relative order and the order of unaffected objects.
  const drawings = updated.flatMap((drawing) =>
    drawing.id === lastMember ? members : selected.has(drawing.id) ? [] : [drawing],
  )
  return { document: normalizeGroupStacking(cleanEmptyGroups({ ...document, groups, drawings })), selection }
}

export function ungroupSelection(document: EditorDocument, ids: readonly string[]): SelectionEdit {
  const selection = expandSelection(document, ids)
  const selected = new Set(selection)
  const fullGroups = fullySelectedGroups(document, selected)
  // Ungroup only the outermost fully selected levels; nested groups remain usable.
  const removed = new Set(
    (document.groups ?? [])
      .filter(
        (group) => fullGroups.has(group.id) && !ancestors(document, group.parentId).some((id) => fullGroups.has(id)),
      )
      .map((group) => group.id),
  )
  if (!removed.size) return { document, selection }
  const parents = new Map((document.groups ?? []).map((group) => [group.id, group.parentId]))
  const parentAfterRemoval = (id?: string) => (id && removed.has(id) ? parents.get(id) : id)
  return {
    document: {
      ...document,
      groups: (document.groups ?? [])
        .filter((group) => !removed.has(group.id))
        .map((group) => ({ ...group, parentId: parentAfterRemoval(group.parentId) })),
      drawings: document.drawings.map((drawing) => ({ ...drawing, groupId: parentAfterRemoval(drawing.groupId) })),
    },
    selection,
  }
}

/** Complete selected groups move as units, preserving the layout within each group. */
function selectionUnits(document: EditorDocument, ids: readonly string[]) {
  const selected = new Set(expandSelection(document, ids))
  const fullGroups = fullySelectedGroups(document, selected)
  const units = new Map<string, Drawing[]>()
  document.drawings.forEach((drawing) => {
    if (!selected.has(drawing.id)) return
    const selectedAncestors = ancestors(document, drawing.groupId).filter((id) => fullGroups.has(id))
    const unitId = selectedAncestors[selectedAncestors.length - 1] ?? drawing.id
    units.set(unitId, [...(units.get(unitId) ?? []), drawing])
  })
  return Array.from(units.values()).map((drawings) => ({
    drawings,
    bounds: combineBounds(drawings.map(getDrawingBounds))!,
  }))
}

function moveUnits(document: EditorDocument, moves: Map<string, { x: number; y: number }>): EditorDocument {
  if (!moves.size || Array.from(moves.values()).every(({ x, y }) => x === 0 && y === 0)) return document
  return {
    ...document,
    drawings: document.drawings.map((drawing) => {
      const delta = moves.get(drawing.id)
      return delta ? translateDrawing(drawing, delta.x, delta.y) : drawing
    }),
  }
}

export function alignSelection(document: EditorDocument, ids: readonly string[], alignment: Alignment): EditorDocument {
  const units = selectionUnits(document, ids)
  if (units.length < 2) return document
  const overall = combineBounds(units.map((unit) => unit.bounds))!
  const moves = new Map<string, { x: number; y: number }>()
  units.forEach(({ drawings, bounds }) => {
    const x =
      alignment === 'left'
        ? overall.minX - bounds.minX
        : alignment === 'right'
        ? overall.maxX - bounds.maxX
        : alignment === 'center'
        ? (overall.minX + overall.maxX - bounds.minX - bounds.maxX) / 2
        : 0
    const y =
      alignment === 'top'
        ? overall.minY - bounds.minY
        : alignment === 'bottom'
        ? overall.maxY - bounds.maxY
        : alignment === 'middle'
        ? (overall.minY + overall.maxY - bounds.minY - bounds.maxY) / 2
        : 0
    drawings.forEach((drawing) => moves.set(drawing.id, { x, y }))
  })
  return moveUnits(document, moves)
}

export function distributeSelection(
  document: EditorDocument,
  ids: readonly string[],
  direction: Distribution,
): EditorDocument {
  const units = selectionUnits(document, ids)
  if (units.length < 3) return document
  const horizontal = direction === 'horizontal'
  const start = horizontal ? 'minX' : 'minY'
  const end = horizontal ? 'maxX' : 'maxY'
  const size = horizontal ? 'width' : 'height'
  units.sort((a, b) => a.bounds[start] - b.bounds[start])
  const first = units[0].bounds[start]
  const last = units[units.length - 1].bounds[end]
  const gap = (last - first - units.reduce((total, unit) => total + unit.bounds[size], 0)) / (units.length - 1)
  const moves = new Map<string, { x: number; y: number }>()
  let cursor = first
  units.forEach(({ drawings, bounds }, index) => {
    const delta = index === 0 || index === units.length - 1 ? 0 : cursor - bounds[start]
    drawings.forEach((drawing) => moves.set(drawing.id, horizontal ? { x: delta, y: 0 } : { x: 0, y: delta }))
    cursor += bounds[size] + gap
  })
  return moveUnits(document, moves)
}

export function patchSelection(
  document: EditorDocument,
  ids: readonly string[],
  patch: Partial<Drawing>,
): EditorDocument {
  const selected = new Set(expandSelection(document, ids))
  if (!selected.size) return document
  return {
    ...document,
    drawings: document.drawings.map((drawing) =>
      selected.has(drawing.id) ? { ...drawing, ...patch, id: drawing.id } : drawing,
    ),
  }
}
