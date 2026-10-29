'use client'

import { useRef, useState } from 'react'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { documentState, editorErrorState, modeAtom } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { importImageFile } from '@/media/image'
import { appendImportedSvg, importSvgFile } from '@/vector/importSvg'
import { useViewport } from './useViewport'
import type { Position } from '@/drawing/creation'

/** File decoding and document insertion share one lifecycle across the picker and drop target. */
export function useArtworkImport(onImported: (kind: 'svg' | 'image') => void) {
  const document = useRecoilValue(documentState)
  const setError = useSetRecoilState(editorErrorState)
  const setMode = useSetRecoilState(modeAtom)
  const { updateDocument } = useEditorActions()
  const { screenToDocument } = useViewport()
  const [pending, setPending] = useState(0)
  const currentDocumentId = useRef(document.id)
  currentDocumentId.current = document.id

  const importArtwork = async (file: File, position?: Position) => {
    const id = document.id
    setPending((count) => count + 1)
    try {
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        const drawings = await importSvgFile(file)
        if (currentDocumentId.current !== id) return
        updateDocument(
          (previous) => appendImportedSvg(previous, drawings),
          drawings.map((drawing) => drawing.id),
        )
        setMode({ type: 'SELECT', subType: 'SHAPE' })
        onImported('svg')
        return
      }
      const drawing = await importImageFile(
        file,
        position ?? screenToDocument({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
      )
      if (currentDocumentId.current !== id) return
      updateDocument((previous) => ({ ...previous, drawings: [...previous.drawings, drawing] }), [drawing.id])
      setMode({ type: 'SELECT', subType: 'SHAPE' })
      onImported('image')
    } catch (error) {
      if (currentDocumentId.current === id)
        setError(error instanceof Error ? error.message : 'Could not import the image.')
    } finally {
      setPending((count) => count - 1)
    }
  }

  return { importArtwork, importing: pending > 0 }
}
