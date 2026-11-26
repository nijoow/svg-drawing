import { atom } from 'jotai'
import type { Drawing, Mode, Options } from '@/types/type'

export const modeAtom = atom<Mode>({ type: 'SELECT', subType: 'SHAPE' })
export const basicOptionsAtom = atom<Options>({ fill: '#000000', stroke: '#000000', strokeWidth: 1, opacity: 1 })
export const selectedDrawingIdAtom = atom<string | null>(null)
export const drawingsAtom = atom<Drawing[]>([])
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
