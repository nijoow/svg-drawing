import { atom } from 'recoil'
import { SnapGuide } from '@/utils/snapping'

export const selectedVertexIdAtom = atom<string | null>({ key: 'SelectedVertexId', default: null })
export const snapGuidesAtom = atom<SnapGuide[]>({ key: 'SnapGuides', default: [] })
