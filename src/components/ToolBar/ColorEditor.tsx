import { useId, useState } from 'react'
import Color from 'color'

// Keep incomplete input local while the user is typing a color.
function ColorField({ name, value, apply }: { name: string; value: string; apply: (text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
      {name}
      <input
        className="min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) apply(draft.trim())
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
        }}
      />
    </label>
  )
}

const formats = { hex: '색상 코드', rgb: '빨강·초록·파랑', hsl: '색상·채도·명도' } as const
type Format = keyof typeof formats

export default function ColorEditor({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const [format, setFormat] = useState<Format>('hex')
  const selectId = useId()
  const parsed = Color(color === 'transparent' ? '#000000' : color)
  const hex = parsed.hex()
  const [hslDraft, setHslDraft] = useState<{ hex: string; channels: number[] } | null>(null)
  const hsl = hslDraft?.hex === color ? hslDraft.channels : parsed.hsl().array()
  function changeHsl(index: number, value: number) {
    const channels = [...hsl]
    channels[index] = value
    const next = Color.hsl(channels).rgb().round(6).hex()
    setHslDraft({ hex: next, channels })
    onChange(next)
  }
  function changeColor(value: string) {
    setHslDraft(null)
    onChange(Color(value).hex())
  }

  function channel(name: string, value: number, max: number, apply: (n: number) => void) {
    return (
      <ColorField
        key={name}
        name={name}
        value={String(Math.round(value))}
        apply={(text) => {
          const n = Number(text)
          if (text && Number.isFinite(n) && n >= 0 && n <= max) apply(n)
        }}
      />
    )
  }
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5">
        <input
          type="color"
          className="h-7 w-10 cursor-pointer"
          value={hex}
          onChange={(e) => changeColor(e.target.value)}
        />
        색 고르기
      </label>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={selectId}>입력 방식</label>
        <select
          id={selectId}
          className="rounded bg-white px-2 py-1"
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
        >
          {Object.entries(formats).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        {format === 'hex' && (
          <ColorField
            name="색상 코드"
            value={color === 'transparent' ? '' : hex}
            apply={(text) => {
              if (/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(text)) changeColor('#' + text.replace(/^#/, ''))
            }}
          />
        )}
        {format === 'rgb' &&
          (
            [
              ['red', '빨강'],
              ['green', '초록'],
              ['blue', '파랑'],
            ] as const
          ).map(([key, name]) => channel(name, parsed[key](), 255, (n) => changeColor(parsed[key](n).hex())))}
        {format === 'hsl' && (
          <>
            {channel('색상(°)', hsl[0], 360, (n) => changeHsl(0, n))}
            {channel('채도(%)', hsl[1], 100, (n) => changeHsl(1, n))}
            {channel('명도(%)', hsl[2], 100, (n) => changeHsl(2, n))}
          </>
        )}
      </div>
    </>
  )
}
