'use client'

import { useEffect, useRef, useState } from 'react'
import { FiGrid, FiSidebar } from 'react-icons/fi'
import { RiPenNibFill } from 'react-icons/ri'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  basicOptionsAtom,
  currentOptionsState,
  gestureAtom,
  drawingsAtom,
  recentColorsAtom,
  modeAtom,
  selectedDrawingState,
} from '@/state/drawing'
import type { Options } from '@/types/type'
import { appName } from '@/appName'
import ColorEditor from './ColorEditor'
import HistoryControls from './HistoryControls'
import DrawingActions from './DrawingActions'

type ColorKey = 'fill' | 'stroke'
const colors = [
  ['fill', '채우기 색'],
  ['stroke', '선 색'],
] as const
const noColor = (color: string) => color === 'transparent' || color === 'none'

function ColorSwatch({ color, outline = false }: { color: string; outline?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={'swatch' + (noColor(color) ? ' no-color' : outline ? ' outline-swatch' : '')}
      style={{ color }}
    />
  )
}

function ColorControls({ value, apply }: { value: string; apply: (color: string) => void }) {
  const [recent, setRecent] = useAtom(recentColorsAtom)
  return (
    <div className="color-controls" id="color-controls">
      <ColorEditor
        color={noColor(value) ? 'transparent' : value}
        onChange={(hex) => {
          apply(hex)
          setRecent((items) => [hex, ...items.filter((c) => c !== hex)].slice(0, 6))
        }}
      />
      <button type="button" className="field-button" onClick={() => apply('transparent')}>
        <ColorSwatch color="transparent" />색 없음
      </button>
      {recent.length > 0 && (
        <div role="group" aria-label="최근 색상">
          <p className="mb-1 text-xs">최근 색상</p>
          <div className="order-grid">
            {recent.map((color) => (
              <button type="button" key={color} className="recent-color" onClick={() => apply(color)}>
                <ColorSwatch color={color} />
                {color.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TopToolBar({ grid, toggleGrid }: { grid: boolean; toggleGrid: () => void }) {
  const selected = useAtomValue(selectedDrawingState)
  const mode = useAtomValue(modeAtom)
  const strokeOnly = mode.type === 'PENCIL' || selected?.type === 'SPLINE'
  const drawings = useAtomValue(drawingsAtom)
  const setDrawings = useSetAtom(drawingsAtom)
  const gesture = useSetAtom(gestureAtom)
  const options = useAtomValue(currentOptionsState)
  const setBasic = useSetAtom(basicOptionsAtom)
  const [open, setOpen] = useState(false)
  const [colorKey, setColorKey] = useState<ColorKey | null>(null)
  const panel = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const colorTrigger = useRef<HTMLButtonElement | null>(null)
  const colorGroup = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)')
    const resize = () => {
      setOpen(wide.matches)
      setColorKey(null)
    }
    resize()
    wide.addEventListener('change', resize)
    return () => wide.removeEventListener('change', resize)
  }, [])

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!colorGroup.current?.contains(event.target)) setColorKey(null)
      if (
        !window.matchMedia('(min-width: 768px)').matches &&
        !panel.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [])

  function apply<K extends keyof Options>(key: K, value: Options[K]) {
    if (options[key] === value) return
    if (selected)
      setDrawings((items) => items.map((item) => (item.id === selected.id ? { ...item, [key]: value } : item)))
    else setBasic((current) => ({ ...current, [key]: value }))
  }

  const sliderGesture = {
    onPointerDown: (event: React.PointerEvent<HTMLInputElement>) => {
      if (!selected || !event.isPrimary || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture('begin')
    },
    onPointerUp: (event: React.PointerEvent) => {
      if (event.isPrimary) gesture('finish')
    },
    onPointerCancel: (event: React.PointerEvent) => {
      if (event.isPrimary) gesture('cancel')
    },
  }

  function closeOnEscape(event: React.KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    if (colorKey) {
      setColorKey(null)
      colorTrigger.current?.focus()
    } else {
      setOpen(false)
      trigger.current?.focus()
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div className="workspace-title">
          <span className="brand-mark">
            <RiPenNibFill aria-hidden="true" />
          </span>
          <h1 lang="en">{appName}</h1>
          <span className="drawing-count">도형 {drawings.length}개</span>
        </div>
        <div className="header-actions">
          <HistoryControls />
          <button type="button" className="tool-button" aria-pressed={grid} onClick={toggleGrid}>
            <FiGrid aria-hidden="true" />
            격자
          </button>
          <button
            type="button"
            className="tool-button"
            ref={trigger}
            aria-expanded={open}
            aria-controls="drawing-properties"
            onClick={() => {
              setOpen(!open)
              setColorKey(null)
            }}
            onKeyDown={closeOnEscape}
          >
            <FiSidebar aria-hidden="true" />
            속성
          </button>
        </div>
      </header>
      {open && (
        <aside
          ref={panel}
          id="drawing-properties"
          className="inspector tool-panel"
          aria-label="도형 속성"
          onKeyDown={closeOnEscape}
        >
          <h2>{selected ? '선택한 도형' : '그리기 기본값'}</h2>
          <div ref={colorGroup}>
            <div className="color-pair">
              {colors.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className="color-button"
                  aria-label={label}
                  disabled={key === 'fill' && strokeOnly}
                  title={key === 'fill' && strokeOnly ? '연필 선에는 채우기 색이 없습니다' : undefined}
                  aria-expanded={colorKey === key}
                  aria-controls={colorKey === key ? 'color-controls' : undefined}
                  onClick={(e) => {
                    colorTrigger.current = e.currentTarget
                    setColorKey(colorKey === key ? null : key)
                  }}
                >
                  <span>{label}</span>
                  <span className="color-value">
                    <ColorSwatch
                      color={key === 'fill' && strokeOnly ? 'none' : options[key]}
                      outline={key === 'stroke'}
                    />
                    {(key === 'fill' && strokeOnly) || noColor(options[key]) ? '없음' : options[key].toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
            {colorKey && !(strokeOnly && colorKey === 'fill') && (
              <ColorControls key={colorKey} value={options[colorKey]} apply={(color) => apply(colorKey, color)} />
            )}
          </div>
          <label className="range-field">
            <span>
              선 굵기 <output>{options.strokeWidth} px</output>
            </span>
            <input
              type="range"
              {...sliderGesture}
              aria-label="선 굵기"
              min="0"
              max="50"
              value={options.strokeWidth}
              onChange={(e) => apply('strokeWidth', Number(e.target.value))}
            />
          </label>
          <label className="range-field">
            <span>
              불투명도 <output>{Math.round(options.opacity * 100)}%</output>
            </span>
            <input
              type="range"
              {...sliderGesture}
              aria-label="불투명도"
              min="1"
              max="100"
              value={Math.round(options.opacity * 100)}
              onChange={(e) => apply('opacity', Number(e.target.value) / 100)}
            />
          </label>
          {selected && <DrawingActions />}
        </aside>
      )}
    </>
  )
}
