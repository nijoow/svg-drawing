import { atom } from 'jotai'
import type { Drawing, Mode, Options } from '@/types/type'

export const modeAtom = atom<Mode>({ type: 'SELECT', subType: 'SHAPE' })
export const basicOptionsAtom = atom<Options>({ fill: '#000000', stroke: '#000000', strokeWidth: 1, opacity: 1 })
export const selectedDrawingIdAtom = atom<string | null>(null)
export const savedDrawingsAtom = atom<Drawing[]>([])
const previewAtom = atom<Drawing[] | null>(null)
type Snapshot = { items: Drawing[]; selected: string | null }
const pastAtom = atom<Snapshot[]>([])
const futureAtom = atom<Snapshot[]>([])
export const canUndoAtom = atom((get) => get(previewAtom) === null && get(pastAtom).length > 0)
export const canRedoAtom = atom((get) => get(previewAtom) === null && get(futureAtom).length > 0)

const commitAtom = atom(null, (get, set, items: Drawing[]) => {
  const previous = get(savedDrawingsAtom)
  if (items === previous) return
  set(pastAtom, [...get(pastAtom).slice(-99), { items: previous, selected: get(selectedDrawingIdAtom) }])
  set(futureAtom, [])
  set(savedDrawingsAtom, items)
})

export const historyAtom = atom(null, (get, set, direction: 'undo' | 'redo') => {
  if (get(previewAtom) !== null) return
  const [from, to] = direction === 'undo' ? [pastAtom, futureAtom] : [futureAtom, pastAtom]
  const stack = get(from)
  const snapshot = stack.at(-1)
  if (!snapshot) return
  const current = get(selectedDrawingIdAtom)
  set(to, [...get(to), { items: get(savedDrawingsAtom), selected: current }])
  set(from, stack.slice(0, -1))
  set(savedDrawingsAtom, snapshot.items)
  set(selectedDrawingIdAtom, snapshot.items.some((item) => item.id === current) ? current : snapshot.selected)
})

export const drawingsAtom = atom(
  (get) => get(previewAtom) ?? get(savedDrawingsAtom),
  (get, set, update: Drawing[] | ((items: Drawing[]) => Drawing[])) => {
    const preview = get(previewAtom)
    const items = preview ?? get(savedDrawingsAtom)
    const next = typeof update === 'function' ? update(items) : update
    if (preview !== null) set(previewAtom, next)
    else set(commitAtom, next)
  },
)
export const gestureAtom = atom(
  null,
  (get, set, action: 'begin' | 'finish' | 'cancel' | ((items: Drawing[]) => Drawing[])) => {
    const preview = get(previewAtom)
    if (typeof action === 'function') {
      if (preview !== null) set(previewAtom, action(preview))
      return
    }
    if (action === 'begin') {
      if (preview === null) set(previewAtom, get(savedDrawingsAtom))
      return
    }
    if (preview === null) return
    if (action === 'finish') set(commitAtom, preview)
    set(previewAtom, null)
  },
)
export const recentColorsAtom = atom<string[]>([])

export const selectedDrawingState = atom((get) => {
  const id = get(selectedDrawingIdAtom)
  return get(drawingsAtom).find((drawing) => drawing.id === id) ?? null
})

export const currentOptionsState = atom((get) => {
  const drawing = get(selectedDrawingState)
  if (!drawing) return get(basicOptionsAtom)
  const { fill, stroke, strokeWidth, opacity } = drawing
  return { fill, stroke, strokeWidth, opacity }
})
