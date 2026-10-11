'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditorActions } from '@/editor/useEditorActions'

export const panelButton =
  'rounded-md bg-gray-500/60 px-2.5 py-1.5 text-xs text-white hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 disabled:cursor-default disabled:opacity-40'
export const panelInput =
  'min-w-0 w-full rounded-md border border-gray-500 bg-gray-700/60 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-300 disabled:opacity-40'

export function NumberField({
  label,
  value,
  onCommit,
  min = -10000000,
  max = 10000000,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))))
  useEffect(() => setDraft(String(Number(value.toFixed(2)))), [value])
  const reset = () => setDraft(String(Number(value.toFixed(2))))
  const commit = () => {
    if (!draft.trim() || !Number.isFinite(Number(draft))) return reset()
    const next = Math.min(max, Math.max(min, Number(draft)))
    setDraft(String(Number(next.toFixed(2))))
    if (next !== value) onCommit(next)
  }
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-200">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        className={panelInput}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.preventDefault()
            reset()
          }
        }}
      />
    </label>
  )
}

export function NameField({
  label,
  value,
  onCommit,
  disabled = false,
  autoFocus = false,
  onFinish,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  onFinish?: () => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      aria-label={label}
      title={value}
      className={panelInput}
      value={draft}
      disabled={disabled}
      autoFocus={autoFocus}
      maxLength={120}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim() || value
        setDraft(next)
        if (next !== value) onCommit(next)
        onFinish?.()
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
          onFinish?.()
        }
      }}
    />
  )
}

/** Native color drags are one undo step, finished before another control edits. */
export function ColorField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
}) {
  const { beginTransaction, endTransaction } = useEditorActions()
  const input = useRef<HTMLInputElement>(null)
  const editing = useRef(false)
  useEffect(() => {
    const finish = () => {
      if (!editing.current) return
      editing.current = false
      endTransaction()
    }
    const outside = (event: PointerEvent) => {
      if (event.target !== input.current) finish()
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', finish)
    const current = input.current
    current?.addEventListener('blur', finish)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', finish)
      current?.removeEventListener('blur', finish)
      finish()
    }
  }, [endTransaction])
  return (
    <input
      ref={input}
      type="color"
      aria-label={label}
      title={label}
      className="h-8 w-9 flex-none cursor-pointer rounded border-0 bg-transparent p-0"
      value={
        /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)
          ? value.slice(0, 7)
          : /^#[\da-f]{3,4}$/i.test(value)
          ? `#${value
              .slice(1, 4)
              .split('')
              .map((character) => character + character)
              .join('')}`
          : value.toLowerCase() === 'white'
          ? '#ffffff'
          : '#000000'
      }
      onChange={(event) => {
        if (!editing.current) {
          editing.current = true
          beginTransaction()
        }
        onCommit(event.target.value)
      }}
    />
  )
}
