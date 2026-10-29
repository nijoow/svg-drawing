'use client'

import { useEffect, useRef, useState } from 'react'
import { useRecoilState, useRecoilValue } from 'recoil'
import { documentState, gridAtom, modeAtom, selectedDrawingsState, snapAtom } from '@/recoil/atoms'
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
import { getViewBounds } from '@/editor/viewBounds'
import { useEditorKeyboard } from '@/hooks/useEditorKeyboard'
import { useArtworkImport } from '@/hooks/useArtworkImport'

export default function Home() {
  const document = useRecoilValue(documentState)
  const mode = useRecoilValue(modeAtom)
  const selection = useRecoilValue(selectedDrawingsState)
  const [grid, setGrid] = useRecoilState(gridAtom)
  const [snap, setSnap] = useRecoilState(snapAtom)
  const { viewport, setViewport, zoomAt, fitToDrawing } = useViewport()
  const [panel, setPanel] = useState<'Layers' | 'Properties' | 'Artboards' | null>(null)
  const { importArtwork, importing } = useArtworkImport((kind) => setPanel(kind === 'svg' ? 'Layers' : 'Properties'))
  const fileInput = useRef<HTMLInputElement>(null)
  const spacePressed = useEditorKeyboard()

  useEffect(() => {
    if (window.innerWidth > 1100) setPanel('Layers')
  }, [])

  const fit = () => {
    const narrow = window.innerWidth <= 1100
    fitToDrawing(
      getViewBounds(document),
      window.innerWidth - (panel && !narrow ? 280 : 0),
      window.innerHeight - (panel && narrow ? Math.min(window.innerHeight * 0.42, 360) + 116 : 0),
    )
  }

  return (
    <main className="relative h-full w-full overflow-hidden bg-white" aria-label="Drawing editor">
      <DrawingCanvas
        spacePressed={spacePressed}
        onImportImage={importArtwork}
        onEditText={() => setPanel('Properties')}
      />
      <DocumentToolBar />
      {selection.length === 0 && <TopToolBar />}
      <SideToolBar onImportImage={() => fileInput.current?.click()} />
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        aria-label="Import image file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importArtwork(file)
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
            aria-expanded={panel === name}
            aria-controls="editor-panel"
            className={`rounded px-2 py-2 ${panel === name ? 'bg-gray-500 text-sky-200' : 'hover:bg-gray-500'}`}
            onClick={() => setPanel(panel === name ? null : name)}
          >
            {name}
          </button>
        ))}
      </div>
      {panel && (
        <aside
          id="editor-panel"
          aria-label={`${panel} panel`}
          className="editor-panel fixed right-4 top-16 z-20 max-h-[calc(100%-10rem)] w-[264px] overflow-y-auto rounded-xl border border-gray-500 bg-gray-600/95 p-3 text-sm text-white shadow-lg backdrop-blur"
        >
          <div className="mb-1 flex items-center justify-end">
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
      <div
        className="tool-status fixed left-4 top-[140px] z-10 rounded-lg bg-gray-600 px-3 py-2 text-xs text-white"
        role="status"
      >
        {mode.type === 'SELECT'
          ? mode.subType === 'VERTEX'
            ? 'Edit points · A'
            : 'Select · V'
          : mode.type === 'SHAPE'
          ? `${mode.subType?.toLowerCase()} · drag to draw`
          : mode.type === 'PENCIL'
          ? 'Pencil · N'
          : mode.type === 'VERTEX'
          ? 'Pen · P'
          : mode.type === 'TEXT'
          ? 'Text · T'
          : 'Pan · H'}
        {selection.length > 0 && (
          <button type="button" className="ml-3 underline" onClick={() => setPanel('Properties')}>
            Edit {selection.length === 1 ? 'object' : `${selection.length} objects`}
          </button>
        )}
      </div>
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
