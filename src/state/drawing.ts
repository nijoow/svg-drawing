import { atom } from 'jotai'
import type { Drawing, Mode, Options } from '@/types/type'

export const modeAtom = atom<Mode>({ type: 'SELECT', subType: 'SHAPE' })
export const basicOptionsAtom = atom<Options>({ fill: '#000000', stroke: '#000000', strokeWidth: 1, opacity: 1 })
export const selectedDrawingIdAtom = atom<string | null>(null)
export const savedDrawingsAtom = atom<Drawing[]>([])
const previewAtom = atom<Drawing[] | null>(null)
export const drawingsAtom = atom(
  (get) => get(previewAtom) ?? get(savedDrawingsAtom),
  (get, set, update: Drawing[] | ((items: Drawing[]) => Drawing[])) => {
    const preview = get(previewAtom)
    const items = preview ?? get(savedDrawingsAtom)
    const next = typeof update === 'function' ? update(items) : update
    if (preview !== null) set(previewAtom, next)
    else set(savedDrawingsAtom, next)
  },
)
export const gestureAtom = atom(null, (get, set, action: 'begin' | 'finish' | 'cancel') => {
  const preview = get(previewAtom)
  if (action === 'begin') {
    if (preview === null) set(previewAtom, get(savedDrawingsAtom))
    return
  }
  if (preview === null) return
  if (action === 'finish') set(savedDrawingsAtom, preview)
  set(previewAtom, null)
})
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
