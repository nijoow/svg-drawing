'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRecoilValue } from 'recoil'
import { selectedDrawingsState } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { Drawing } from '@/types/type'
import { reflowTextDrawing, SYSTEM_FONTS, TextPatch } from '@/media/text'
import { cropForAspectRatio, cropImageDrawing, FULL_CROP, ImageCrop } from '@/media/image'
import Slider from '@/components/Slider/Slider'

const inputClass =
  'w-full min-w-0 rounded bg-gray-700 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-400'
const buttonClass =
  'rounded bg-gray-700 px-2 py-1.5 text-xs hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300'

function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  begin,
  end,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  begin: () => void
  end: () => void
}) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-200">
      {label}
      <input
        type="number"
        aria-label={label}
        className={inputClass}
        min={min}
        max={max}
        step={step}
        value={draft}
        onFocus={() => {
          focused.current = true
          begin()
        }}
        onChange={(event) => {
          begin()
          const next = event.target.value
          setDraft(next)
          const number = Number(next)
          if (next !== '' && Number.isFinite(number) && number >= min && number <= max) onChange(number)
        }}
        onBlur={() => {
          focused.current = false
          const number = Number(draft)
          const next = draft !== '' && Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : value
          if (next !== value) onChange(next)
          setDraft(String(next))
          end()
        }}
      />
    </label>
  )
}

function PropertyRange({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  begin,
  end,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
  begin: () => void
  end: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 text-gray-200">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <Slider
          label={label}
          value={value}
          setValue={onChange}
          option={{ min, max, step }}
          onEditStart={begin}
          onEditEnd={end}
        />
        <output className="w-10 text-right tabular-nums">
          {Math.round(value * 100) / 100}
          {suffix}
        </output>
      </div>
    </div>
  )
}

function MediaEditor({ drawing }: { drawing: Drawing }) {
  const { updateDocument, beginTransaction, endTransaction } = useEditorActions()
  const panel = useRef<HTMLDivElement>(null)
  const editing = useRef(false)
  const begin = useCallback(() => {
    if (editing.current) return
    editing.current = true
    beginTransaction()
  }, [beginTransaction])
  const end = useCallback(() => {
    if (!editing.current) return
    editing.current = false
    endTransaction()
  }, [endTransaction])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) end()
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', end)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', end)
      end()
    }
  }, [end])
  const update = (transform: (current: Drawing) => Drawing) => {
    updateDocument((document) => ({
      ...document,
      drawings: document.drawings.map((current) =>
        current.id === drawing.id && !current.locked ? transform(current) : current,
      ),
    }))
  }
  const updateText = (patch: TextPatch) => update((current) => reflowTextDrawing(current, patch))
  const updateCrop = (patch: Partial<ImageCrop>) =>
    update((current) => (current.image ? cropImageDrawing(current, { ...current.image.crop, ...patch }) : current))
  const text = drawing.text
  const image = drawing.image
  const crop = image?.crop
  const effects = drawing.effects ?? { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, blur: 0, hue: 0 }
  const adjustments: {
    key: keyof typeof effects
    label: string
    min: number
    max: number
    factor: number
    suffix?: string
  }[] = [
    { key: 'brightness', label: 'Brightness', min: 0, max: 200, factor: 100, suffix: '%' },
    { key: 'contrast', label: 'Contrast', min: 0, max: 200, factor: 100, suffix: '%' },
    { key: 'saturation', label: 'Saturation', min: 0, max: 200, factor: 100, suffix: '%' },
    { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, factor: 100, suffix: '%' },
    { key: 'hue', label: 'Hue', min: -180, max: 180, factor: 1, suffix: '°' },
    { key: 'blur', label: 'Blur', min: 0, max: 30, factor: 1, suffix: 'px' },
  ]

  return (
    <div
      ref={panel}
      className="space-y-4 text-white"
      aria-label={drawing.type === 'TEXT' ? 'Text properties' : 'Image properties'}
    >
      {text && (
        <section className="space-y-3" aria-label="Typography">
          <h3 className="text-xs font-semibold text-gray-100">Text</h3>
          <label className="flex flex-col gap-1 text-xs text-gray-200">
            Content
            <textarea
              aria-label="Text content"
              rows={3}
              maxLength={10000}
              value={text.content}
              spellCheck={false}
              className={`${inputClass} resize-y`}
              onFocus={begin}
              onChange={(event) => {
                begin()
                updateText({ content: event.target.value })
              }}
              onBlur={end}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-200">
            Font
            <select
              aria-label="Font family"
              value={text.fontFamily}
              onChange={(event) => updateText({ fontFamily: event.target.value })}
              className={inputClass}
            >
              {SYSTEM_FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
              {!SYSTEM_FONTS.some((font) => font.value === text.fontFamily) && (
                <option value={text.fontFamily}>{text.fontFamily}</option>
              )}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumericField
              label="Font size"
              value={text.fontSize}
              min={1}
              max={1000}
              begin={begin}
              end={end}
              onChange={(fontSize) => updateText({ fontSize })}
            />
            <label className="flex flex-col gap-1 text-xs text-gray-200">
              Alignment
              <select
                aria-label="Text alignment"
                value={text.align}
                onChange={(event) => updateText({ align: event.target.value as TextPatch['align'] })}
                className={inputClass}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`${buttonClass} flex-1 font-bold ${text.fontWeight >= 600 ? 'ring-1 ring-blue-300' : ''}`}
              aria-pressed={text.fontWeight >= 600}
              aria-label="Bold text"
              onClick={() => updateText({ fontWeight: text.fontWeight >= 600 ? 400 : 700 })}
            >
              Bold
            </button>
            <button
              type="button"
              className={`${buttonClass} flex-1 italic ${text.fontStyle === 'italic' ? 'ring-1 ring-blue-300' : ''}`}
              aria-pressed={text.fontStyle === 'italic'}
              aria-label="Italic text"
              onClick={() => updateText({ fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' })}
            >
              Italic
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumericField
              label="Line height"
              value={text.lineHeight}
              min={0.5}
              max={5}
              step={0.1}
              begin={begin}
              end={end}
              onChange={(lineHeight) => updateText({ lineHeight })}
            />
            <NumericField
              label="Letter spacing"
              value={text.letterSpacing}
              min={-100}
              max={100}
              step={0.5}
              begin={begin}
              end={end}
              onChange={(letterSpacing) => updateText({ letterSpacing })}
            />
          </div>
          <p className="text-[10px] leading-4 text-gray-300">
            System fonts support native Korean input. Text stays editable in project files and SVG.
          </p>
        </section>
      )}

      {image && crop && (
        <section className="space-y-3" aria-label="Image crop">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold">Crop</h3>
            <span className="text-[10px] text-gray-300">
              {image.naturalWidth} × {image.naturalHeight}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button type="button" className={buttonClass} onClick={() => updateCrop(FULL_CROP)}>
              Reset
            </button>
            {[
              ['1:1', 1],
              ['4:3', 4 / 3],
              ['16:9', 16 / 9],
            ].map(([label, ratio]) => (
              <button
                key={label}
                type="button"
                className={buttonClass}
                aria-label={`Crop ${label}`}
                onClick={() => updateCrop(cropForAspectRatio(image.naturalWidth, image.naturalHeight, Number(ratio)))}
              >
                {label}
              </button>
            ))}
          </div>
          <PropertyRange
            label="Crop width"
            value={crop.width * 100}
            min={1}
            max={100}
            suffix="%"
            begin={begin}
            end={end}
            onChange={(width) => updateCrop({ width: width / 100 })}
          />
          <PropertyRange
            label="Crop height"
            value={crop.height * 100}
            min={1}
            max={100}
            suffix="%"
            begin={begin}
            end={end}
            onChange={(height) => updateCrop({ height: height / 100 })}
          />
          <PropertyRange
            label="Crop left"
            value={crop.x * 100}
            min={0}
            max={Math.max(0, (1 - crop.width) * 100)}
            step={0.1}
            suffix="%"
            begin={begin}
            end={end}
            onChange={(x) => updateCrop({ x: x / 100 })}
          />
          <PropertyRange
            label="Crop top"
            value={crop.y * 100}
            min={0}
            max={Math.max(0, (1 - crop.height) * 100)}
            step={0.1}
            suffix="%"
            begin={begin}
            end={end}
            onChange={(y) => updateCrop({ y: y / 100 })}
          />
          <p className="text-[10px] leading-4 text-gray-300">
            The original image is preserved. Reduce the crop width or height to move the crop region.
          </p>
        </section>
      )}

      {image && (
        <section className="space-y-3 border-t border-gray-500 pt-3" aria-label="Image adjustments">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold">Adjustments</h3>
            <button
              type="button"
              className="text-xs text-blue-200 hover:text-white"
              onClick={() => update((current) => ({ ...current, effects: undefined }))}
            >
              Reset adjustments
            </button>
          </div>
          {adjustments.map(({ key, label, min, max, factor, suffix }) => (
            <PropertyRange
              key={key}
              label={label}
              value={effects[key] * factor}
              min={min}
              max={max}
              suffix={suffix}
              begin={begin}
              end={end}
              onChange={(value) =>
                update((current) => ({
                  ...current,
                  effects: { ...effects, ...current.effects, [key]: value / factor },
                }))
              }
            />
          ))}
        </section>
      )}
    </div>
  )
}

export default function MediaProperties() {
  const selected = useRecoilValue(selectedDrawingsState)
  const drawing = selected.length === 1 ? selected[0] : null
  if (!drawing || drawing.locked || (drawing.type !== 'TEXT' && drawing.type !== 'IMAGE')) return null
  return <MediaEditor key={drawing.id} drawing={drawing} />
}
