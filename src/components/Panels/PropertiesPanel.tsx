'use client'

import { useRecoilValue } from 'recoil'
import { documentState, selectedDrawingsState } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { applySelectionMask, changeDrawingGeometry, maskSource, type GeometryField } from '@/editor/panelCommands'
import type { Drawing } from '@/types/type'
import { ColorField, NameField, NumberField, panelButton, panelInput } from './PanelFields'

export default function PropertiesPanel() {
  const document = useRecoilValue(documentState)
  const selected = useRecoilValue(selectedDrawingsState)
  const actions = useEditorActions()
  const drawing = selected[0]
  if (!drawing)
    return (
      <section aria-label="Properties panel" className="space-y-3 text-white">
        <h2 className="text-sm font-medium">Properties</h2>
        <p className="py-6 text-center text-xs leading-5 text-gray-300">
          Select an object to adjust its size,
          <br />
          appearance and artboard.
        </p>
      </section>
    )
  const ids = selected.map(({ id }) => id)
  const geometry = (field: GeometryField, value: number) =>
    actions.updateDocument((current) => ({
      ...current,
      drawings: current.drawings.map((item) =>
        item.id === drawing.id ? changeDrawingGeometry(item, field, value) : item,
      ),
    }))
  const gradient = drawing.gradient
  const setGradient = (value: Drawing['gradient']) => actions.patchSelection({ gradient: value })
  const source = maskSource(selected)
  const supportsGradient = selected.every((item) => item.type !== 'IMAGE' && item.type !== 'SPLINE')
  const addStop = () => {
    if (!gradient || gradient.stops.length >= 16) return
    const stops = [...gradient.stops].sort((a, b) => a.offset - b.offset)
    let index = 0
    for (let i = 1; i < stops.length - 1; i++) {
      if (stops[i + 1].offset - stops[i].offset > stops[index + 1].offset - stops[index].offset) index = i
    }
    stops.splice(index + 1, 0, {
      offset: (stops[index].offset + stops[index + 1].offset) / 2,
      color: stops[index].color,
    })
    setGradient({ ...gradient, stops })
  }
  return (
    <section key={drawing.id} aria-label="Properties panel" className="space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Properties</h2>
        <span className="text-xs text-gray-300">
          {selected.length === 1 ? drawing.type.toLowerCase() : `${selected.length} selected`}
        </span>
      </div>
      {selected.length === 1 && (
        <>
          <NameField
            label="Object name"
            value={drawing.name || drawing.type.toLowerCase()}
            onCommit={(name) => actions.patchSelection({ name })}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="X"
              value={drawing.center.x - drawing.width / 2}
              onCommit={(value) => geometry('x', value)}
            />
            <NumberField
              label="Y"
              value={drawing.center.y - drawing.height / 2}
              onCommit={(value) => geometry('y', value)}
            />
            <NumberField
              label="Width"
              value={drawing.width}
              min={0.01}
              disabled={drawing.width === 0}
              onCommit={(value) => geometry('width', value)}
            />
            <NumberField
              label="Height"
              value={drawing.height}
              min={0.01}
              disabled={drawing.height === 0}
              onCommit={(value) => geometry('height', value)}
            />
            <NumberField
              label="Rotation"
              value={drawing.rotate}
              min={-360}
              max={360}
              onCommit={(value) => geometry('rotate', value)}
            />
            <NumberField
              label="Opacity %"
              value={drawing.opacity * 100}
              min={0}
              max={100}
              onCommit={(value) => actions.patchSelection({ opacity: value / 100 })}
            />
          </div>
        </>
      )}
      <div className="space-y-2 border-t border-gray-500 pt-3">
        <label className="flex items-center justify-between gap-2 text-xs">
          <span>Fill</span>
          <select
            aria-label="Fill type"
            className={`${panelInput} !w-28`}
            disabled={!supportsGradient}
            value={gradient?.type || 'solid'}
            onChange={(event) => {
              if (event.target.value === 'solid') setGradient(undefined)
              else
                setGradient({
                  type: event.target.value as 'linear' | 'radial',
                  angle: gradient?.angle ?? 0,
                  stops: gradient?.stops ?? [
                    {
                      offset: 0,
                      color: drawing.fill === 'none' || drawing.fill === 'transparent' ? '#3b82f6' : drawing.fill,
                    },
                    { offset: 1, color: '#ffffff' },
                  ],
                })
            }}
          >
            <option value="solid">Solid</option>
            <option value="linear">Linear gradient</option>
            <option value="radial">Radial gradient</option>
          </select>
        </label>
        {!supportsGradient && <p className="text-[11px] text-gray-300">Select a shape or text for gradient fill.</p>}
        {gradient && supportsGradient && (
          <>
            <div
              className="h-5 rounded"
              aria-label="Gradient preview"
              style={{
                background: `linear-gradient(90deg, ${gradient.stops
                  .map(({ offset, color }) => `${color} ${offset * 100}%`)
                  .join(',')})`,
              }}
            />
            {gradient.type === 'linear' && (
              <NumberField
                label="Gradient angle"
                value={gradient.angle}
                min={-360}
                max={360}
                onCommit={(angle) => setGradient({ ...gradient, angle })}
              />
            )}
            {gradient.stops.map((stop, index) => (
              <div key={index} className="flex items-end gap-2">
                <ColorField
                  label={`Stop ${index + 1} color`}
                  value={stop.color}
                  onCommit={(color) =>
                    setGradient({
                      ...gradient,
                      stops: gradient.stops.map((item, i) => (i === index ? { ...item, color } : item)),
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <NumberField
                    label={`Stop ${index + 1} %`}
                    value={stop.offset * 100}
                    min={0}
                    max={100}
                    onCommit={(offset) =>
                      setGradient({
                        ...gradient,
                        stops: gradient.stops
                          .map((item, i) => (i === index ? { ...item, offset: offset / 100 } : item))
                          .sort((a, b) => a.offset - b.offset),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className={`${panelButton} mb-0.5`}
                  aria-label={`Remove gradient stop ${index + 1}`}
                  disabled={gradient.stops.length <= 2}
                  onClick={() => setGradient({ ...gradient, stops: gradient.stops.filter((_, i) => i !== index) })}
                >
                  −
                </button>
              </div>
            ))}
            <button
              type="button"
              className={`${panelButton} w-full`}
              onClick={addStop}
              disabled={gradient.stops.length >= 16}
            >
              Add color stop
            </button>
          </>
        )}
      </div>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span>Blend</span>
        <select
          aria-label="Blend mode"
          className={`${panelInput} !w-32`}
          value={drawing.blendMode || 'normal'}
          onChange={(event) => actions.patchSelection({ blendMode: event.target.value as Drawing['blendMode'] })}
        >
          {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].map((mode) => (
            <option key={mode} value={mode}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-2 border-t border-gray-500 pt-3">
        <h3 className="text-xs font-medium">Clipping mask</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className={panelButton}
            disabled={!source}
            onClick={() => {
              actions.updateDocument(
                (current) => applySelectionMask(current, ids),
                ids.filter((id) => id !== source?.id),
              )
            }}
          >
            Create mask
          </button>
          <button
            type="button"
            className={panelButton}
            disabled={!selected.some((item) => item.clip)}
            onClick={() => actions.patchSelection({ clip: undefined })}
          >
            Release
          </button>
        </div>
        <p className="text-[11px] leading-4 text-gray-300">
          Select objects and a closed shape above them. The top shape becomes their mask. Undo restores the source
          shape.
        </p>
      </div>
      {document.artboards.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          Artboard
          <select
            className={panelInput}
            aria-label="Object artboard"
            value={drawing.artboardId || ''}
            onChange={(event) => actions.patchSelection({ artboardId: event.target.value || undefined })}
          >
            <option value="">No artboard</option>
            {document.artboards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}
