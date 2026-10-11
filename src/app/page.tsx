'use client'

import { useEffect, useRef, useState } from 'react'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { documentState, editorErrorState, gridAtom, modeAtom, selectedDrawingsState, snapAtom } from '@/recoil/atoms'
import SideToolBar from '@/components/ToolBar/SideToolBar'
import TopToolBar from '@/components/ToolBar/TopToolBar'
import DocumentToolBar from '@/components/ToolBar/DocumentToolBar'
import WorkspaceToolBar from '@/components/ToolBar/WorkspaceToolBar'
import VectorToolBar from '@/components/ToolBar/VectorToolBar'
import VertexToolBar from '@/components/ToolBar/VertexToolBar'
import LayersPanel from '@/components/Panels/LayersPanel'
import PropertiesPanel from '@/components/Panels/PropertiesPanel'
import ArtboardsPanel from '@/components/Panels/ArtboardsPanel'
import MediaProperties from '@/components/Panels/MediaProperties'
import DrawingCanvas from '@/components/Canvas/DrawingCanvas'
import { useViewport } from '@/hooks/useViewport'
import { useEditorActions } from '@/editor/useEditorActions'
import { getViewBounds } from '@/editor/viewBounds'
import { useEditorKeyboard } from '@/hooks/useEditorKeyboard'
import { importImageFile } from '@/media/image'
import { appendImportedSvg, importSvg } from '@/vector/importSvg'
import type { Position } from '@/drawing/creation'

export default function Home() {
  const document = useRecoilValue(documentState)
  const [mode, setMode] = useRecoilState(modeAtom)
  const selection = useRecoilValue(selectedDrawingsState)
  const [grid, setGrid] = useRecoilState(gridAtom)
  const [snap, setSnap] = useRecoilState(snapAtom)
  const setError = useSetRecoilState(editorErrorState)
  const actions = useEditorActions()
  const { viewport, setViewport, screenToDocument, zoomAt, fitToDrawing } = useViewport()
  const [panel, setPanel] = useState<'Layers' | 'Properties' | 'Artboards' | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const currentDocumentId = useRef(document.id)
  currentDocumentId.current = document.id
  const spacePressed = useEditorKeyboard()

  useEffect(() => {
    if (window.innerWidth > 1100) setPanel('Layers')
  }, [])

  const fit = () => {
    fitToDrawing(getViewBounds(document), window.innerWidth - (panel ? 280 : 0), window.innerHeight)
  }

  const importImage = async (file: File, position?: Position) => {
    const id = document.id
    setImporting(true)
    try {
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        if (file.size > 10 * 1024 * 1024) throw new Error('SVG files must be smaller than 10 MB.')
        const drawings = await importSvg(await file.text())
        if (currentDocumentId.current !== id) return
        actions.updateDocument(
          (previous) => appendImportedSvg(previous, drawings),
          drawings.map((drawing) => drawing.id),
        )
        setMode({ type: 'SELECT', subType: 'SHAPE' })
        setPanel('Layers')
        return
      }
      const drawing = await importImageFile(
        file,
        position ?? screenToDocument({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
      )
      if (currentDocumentId.current !== id) return
      actions.updateDocument((previous) => ({ ...previous, drawings: [...previous.drawings, drawing] }), [drawing.id])
      setMode({ type: 'SELECT', subType: 'SHAPE' })
      setPanel('Properties')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not import the image.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className="relative h-full w-full overflow-hidden bg-white" aria-label="Drawing editor">
      <DrawingCanvas
        spacePressed={spacePressed}
        onImportImage={importImage}
        onEditText={() => setPanel('Properties')}
      />
      <DocumentToolBar />
      <TopToolBar />
      <SideToolBar onImportImage={() => fileInput.current?.click()} />
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Import image file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importImage(file)
        }}
      />
      <div
        className="panel-switcher fixed right-4 top-4 z-20 flex gap-1 rounded-lg bg-gray-600 p-1 text-xs text-white shadow-sm"
        role="toolbar"
        aria-label="Editor panels"
      >
        {(['Layers', 'Properties', 'Artboards'] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={panel === name}
            className={`rounded px-2 py-2 ${panel === name ? 'bg-gray-500 text-sky-200' : 'hover:bg-gray-500'}`}
            onClick={() => setPanel(panel === name ? null : name)}
          >
            {name}
          </button>
        ))}
      </div>
      {panel && (
        <aside
          aria-label={`${panel} panel`}
          className="editor-panel fixed right-4 top-16 z-20 max-h-[calc(100%-10rem)] w-[264px] overflow-y-auto rounded-xl border border-gray-500 bg-gray-600/95 p-3 text-sm text-white shadow-lg backdrop-blur"
        >
          <div className="mb-1 flex items-center justify-end">
            <h2 className="sr-only">{panel}</h2>
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setPanel(null)}
              className="rounded px-2 text-lg hover:bg-gray-500"
            >
              ×
            </button>
          </div>
          {panel === 'Layers' && <LayersPanel />}
          {panel === 'Properties' && (
            <>
              <PropertiesPanel />
              <MediaProperties />
            </>
          )}
          {panel === 'Artboards' && <ArtboardsPanel />}
        </aside>
      )}
      <WorkspaceToolBar />
      <div className="context-tools fixed bottom-[72px] left-1/2 z-20 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg bg-gray-600 text-white shadow-sm">
        {selection.length > 1 && <VectorToolBar />}
        {selection.length === 1 && mode.type === 'SELECT' && mode.subType === 'VERTEX' && <VertexToolBar />}
      </div>
      <div
        className="viewport-tools fixed bottom-4 left-4 z-20 flex items-center gap-1 rounded-lg bg-gray-600 p-1 text-xs text-white shadow-sm"
        role="toolbar"
        aria-label="Viewport controls"
      >
        <button
          aria-label="Zoom out"
          title="Zoom out"
          className="rounded p-2 hover:bg-gray-500"
          onClick={() => zoomAt(viewport.zoom / 1.25, { x: window.innerWidth / 2, y: window.innerHeight / 2 })}
        >
          −
        </button>
        <button
          title="Reset to 100%"
          aria-label="Reset zoom"
          className="min-w-[44px] rounded p-1 hover:bg-gray-500"
          onClick={() => zoomAt(1, { x: window.innerWidth / 2, y: window.innerHeight / 2 })}
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          title="Zoom in"
          className="rounded p-2 hover:bg-gray-500"
          onClick={() => zoomAt(viewport.zoom * 1.25, { x: window.innerWidth / 2, y: window.innerHeight / 2 })}
        >
          +
        </button>
        <button title="Fit artwork" onClick={fit} className="rounded p-2 hover:bg-gray-500">
          Fit
        </button>
        <button
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
          className={`rounded p-2 ${grid ? 'bg-gray-500 text-sky-200' : ''}`}
        >
          Grid
        </button>
        <button
          aria-pressed={snap}
          onClick={() => setSnap(!snap)}
          className={`rounded p-2 ${snap ? 'bg-gray-500 text-sky-200' : ''}`}
        >
          Snap
        </button>
        <button
          aria-label="Reset view"
          title="Reset view"
          onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          className="rounded p-2 hover:bg-gray-500"
        >
          ↺
        </button>
      </div>
      {importing && (
        <div
          role="status"
          className="fixed bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-gray-600 px-4 py-2 text-sm text-white"
        >
          Importing image…
        </div>
      )}
    </main>
  )
}
