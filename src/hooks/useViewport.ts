'use client'

import { useCallback } from 'react'
import { useRecoilState } from 'recoil'
import { viewportAtom } from '@/recoil/atoms'
import type { DrawingBounds } from '@/editor/document'
import {
  documentToScreen as toScreen,
  fitViewportToBounds,
  screenToDocument as toDocument,
  zoomViewportAt,
  type Position,
} from '@/editor/viewport'

export function useViewport() {
  const [viewport, setViewport] = useRecoilState(viewportAtom)
  const screenToDocument = useCallback((point: Position) => toDocument(viewport, point), [viewport])
  const documentToScreen = useCallback((point: Position) => toScreen(viewport, point), [viewport])
  const zoomAt = useCallback(
    (zoom: number, screenPoint: Position) => setViewport((current) => zoomViewportAt(current, zoom, screenPoint)),
    [setViewport],
  )
  const fitToDrawing = useCallback(
    (bounds: DrawingBounds, width: number, height: number) => setViewport(fitViewportToBounds(bounds, width, height)),
    [setViewport],
  )
  return { viewport, setViewport, screenToDocument, documentToScreen, zoomAt, fitToDrawing }
}
