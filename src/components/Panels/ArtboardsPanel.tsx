'use client'

import { useState } from 'react'
import { useRecoilState, useRecoilValue } from 'recoil'
import { v4 as uuid } from 'uuid'
import { documentState, selectedDrawingsState, viewportAtom } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { getDrawingBounds } from '@/editor/document'
import { removeArtboard } from '@/editor/panelCommands'
import { NameField, NumberField, panelButton, panelInput } from './PanelFields'

const presets = [
  { name: 'Canvas · 800 × 600', width: 800, height: 600 },
  { name: 'Square · 1080 × 1080', width: 1080, height: 1080 },
  { name: 'Screen · 1920 × 1080', width: 1920, height: 1080 },
  { name: 'Icon · 24 × 24', width: 24, height: 24 },
]

export default function ArtboardsPanel() {
  const document = useRecoilValue(documentState)
  const selected = useRecoilValue(selectedDrawingsState)
  const [viewport, setViewport] = useRecoilState(viewportAtom)
  const actions = useEditorActions()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [presetIndex, setPresetIndex] = useState(0)
  const board = document.artboards.find((item) => item.id === activeId) ?? document.artboards[0]
  const fit = (item: { x: number; y: number; width: number; height: number }) => {
    const availableWidth = Math.max(160, window.innerWidth - 400)
    const availableHeight = Math.max(160, window.innerHeight - 240)
    const zoom = Math.max(0.05, Math.min(8, availableWidth / item.width, availableHeight / item.height))
    setViewport({
      zoom,
      x: 80 + (availableWidth - item.width * zoom) / 2 - item.x * zoom,
      y: 150 + (availableHeight - item.height * zoom) / 2 - item.y * zoom,
    })
  }
  const add = (fromSelection = false) => {
    const id = uuid()
    const preset = presets[presetIndex]
    const last = document.artboards[document.artboards.length - 1]
    let x = last ? last.x + last.width + 80 : (100 - viewport.x) / viewport.zoom
    let y = last ? last.y : (180 - viewport.y) / viewport.zoom
    let { width, height } = preset
    if (fromSelection && selected.length) {
      const bounds = selected.map(getDrawingBounds)
      x = Math.floor(Math.min(...bounds.map((item) => item.minX)))
      y = Math.floor(Math.min(...bounds.map((item) => item.minY)))
      width = Math.max(1, Math.ceil(Math.max(...bounds.map((item) => item.maxX)) - x))
      height = Math.max(1, Math.ceil(Math.max(...bounds.map((item) => item.maxY)) - y))
    }
    const item = { id, name: `Artboard ${document.artboards.length + 1}`, x, y, width, height }
    const ids = new Set(selected.map(({ id: drawingId }) => drawingId))
    actions.updateDocument((current) => ({
      ...current,
      artboards: [...current.artboards, item],
      drawings: fromSelection
        ? current.drawings.map((drawing) => (ids.has(drawing.id) ? { ...drawing, artboardId: id } : drawing))
        : current.drawings,
    }))
    setActiveId(id)
    fit(item)
  }
  const update = (patch: Partial<{ name: string; x: number; y: number; width: number; height: number }>) => {
    if (!board) return
    actions.updateDocument((current) => ({
      ...current,
      artboards: current.artboards.map((item) => (item.id === board.id ? { ...item, ...patch } : item)),
    }))
  }
  return (
    <section aria-label="Artboard controls" className="space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Artboards</h2>
        <span className="text-xs text-gray-300">{document.artboards.length}</span>
      </div>
      <div className="space-y-2">
        <select
          aria-label="Artboard preset"
          className={panelInput}
          value={presetIndex}
          onChange={(event) => setPresetIndex(Number(event.target.value))}
        >
          {presets.map((preset, index) => (
            <option key={preset.name} value={index}>
              {preset.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="button" className={`${panelButton} flex-1`} onClick={() => add()}>
            Add artboard
          </button>
          <button
            type="button"
            className={`${panelButton} flex-1`}
            disabled={!selected.length}
            onClick={() => add(true)}
          >
            From selection
          </button>
        </div>
      </div>
      {document.artboards.length ? (
        <div className="space-y-1" role="list" aria-label="Artboard list">
          {document.artboards.map((item) => (
            <div
              key={item.id}
              role="listitem"
              className={`flex items-center gap-2 rounded-md p-1 ${
                item.id === board?.id ? 'bg-blue-500/40' : 'bg-gray-700/20'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-1.5 py-1 text-left"
                aria-pressed={item.id === board?.id}
                onClick={() => setActiveId(item.id)}
                onDoubleClick={() => fit(item)}
              >
                <span className="block truncate text-xs">{item.name}</span>
                <span className="text-[10px] text-gray-300">
                  {Math.round(item.width)} × {Math.round(item.height)}
                </span>
              </button>
              <button
                type="button"
                className={panelButton}
                aria-label={`Fit ${item.name}`}
                onClick={() => {
                  setActiveId(item.id)
                  fit(item)
                }}
              >
                Fit
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-xs leading-5 text-gray-300">
          Keep an open canvas, or add artboards
          <br />
          for several sizes in one document.
        </p>
      )}
      {board && (
        <div key={board.id} className="space-y-3 border-t border-gray-500 pt-3">
          <NameField label="Artboard name" value={board.name} onCommit={(name) => update({ name })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Artboard X" value={board.x} onCommit={(x) => update({ x })} />
            <NumberField label="Artboard Y" value={board.y} onCommit={(y) => update({ y })} />
            <NumberField label="Artboard width" value={board.width} min={1} onCommit={(width) => update({ width })} />
            <NumberField
              label="Artboard height"
              value={board.height}
              min={1}
              onCommit={(height) => update({ height })}
            />
          </div>
          <button
            type="button"
            className={`${panelButton} w-full`}
            disabled={!selected.length}
            onClick={() => actions.patchSelection({ artboardId: board.id })}
          >
            Assign selected objects
          </button>
          <button
            type="button"
            className={`${panelButton} w-full`}
            onClick={() => actions.updateDocument((current) => removeArtboard(current, board.id))}
          >
            Remove artboard
          </button>
          <p className="text-[11px] leading-4 text-gray-300">
            Removing or resizing an artboard keeps its objects in place. Choose an artboard in the export dialog to crop
            the output.
          </p>
        </div>
      )}
    </section>
  )
}
