import { Drawing, Options } from '@/types/type'
import { v4 as uuid } from 'uuid'
import { MediaPosition, rectangleVertices, resizeMediaFrame } from './frame'

export type TextStyle = NonNullable<Drawing['text']>
export type TextPatch = Partial<Omit<TextStyle, 'naturalWidth' | 'naturalHeight'>>
export type TextMeasurer = (line: string, style: TextPatch) => number

export const SYSTEM_FONTS = [
  { label: 'System sans / 한글', value: 'Arial, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif' },
  { label: 'System serif / 명조', value: 'Georgia, "Batang", "AppleMyungjo", serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
] as const

const defaults: TextPatch = {
  content: 'Type your text',
  fontFamily: SYSTEM_FONTS[0].value,
  fontSize: 32,
  fontWeight: 400,
  fontStyle: 'normal',
  align: 'left',
  lineHeight: 1.3,
  letterSpacing: 0,
}

let canvas: HTMLCanvasElement | undefined

function defaultMeasure(line: string, style: TextPatch): number {
  if (typeof document !== 'undefined') {
    canvas ??= document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`
      return context.measureText(line).width
    }
  }
  // Browser imports measure actual system fonts. This fallback keeps server-side
  // document creation deterministic without depending on installed fonts.
  return (
    Array.from(line).reduce((width, character) => width + ((character.codePointAt(0) ?? 0) > 255 ? 1 : 0.6), 0) *
    (style.fontSize ?? 32)
  )
}

export function measureTextLayout(patch: TextPatch, measure: TextMeasurer = defaultMeasure): TextStyle {
  const style = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, patch[key as keyof TextPatch] ?? fallback]),
  ) as Omit<TextStyle, 'naturalWidth' | 'naturalHeight'>
  style.content = style.content.replace(/\r\n?/g, '\n')
  if (style.content.length > 10000) throw new Error('Text is limited to 10,000 characters per object.')
  const lines = style.content.split('\n')
  const naturalWidth = Math.max(
    1,
    style.fontSize * 0.5,
    ...lines.map((line) => measure(line, style) + Math.max(0, Array.from(line).length - 1) * style.letterSpacing),
  )
  const naturalHeight = Math.max(1, (lines.length - 1) * style.fontSize * style.lineHeight + style.fontSize * 1.25)
  return { ...style, naturalWidth, naturalHeight }
}

export function createTextDrawing(position: MediaPosition, options: TextPatch & Partial<Options> = {}): Drawing {
  const text = measureTextLayout(options)
  return {
    id: uuid(),
    type: 'TEXT',
    subType: null,
    name: 'Text',
    width: text.naturalWidth,
    height: text.naturalHeight,
    center: { x: position.x + text.naturalWidth / 2, y: position.y + text.naturalHeight / 2 },
    vertexs: rectangleVertices(position, text.naturalWidth, text.naturalHeight),
    rotate: 0,
    fill: options.fill ?? '#000000',
    stroke: options.stroke ?? 'transparent',
    strokeWidth: options.strokeWidth ?? 0,
    opacity: options.opacity ?? 1,
    text,
  }
}

/** Reflow text while retaining the user's object scale, angle and starting point. */
export function reflowTextDrawing(drawing: Drawing, patch: TextPatch, measure?: TextMeasurer): Drawing {
  if (drawing.type !== 'TEXT' || !drawing.text) return drawing
  const text = measureTextLayout({ ...drawing.text, ...patch }, measure)
  const scaleX = drawing.width / drawing.text.naturalWidth
  const scaleY = drawing.height / drawing.text.naturalHeight
  return {
    ...resizeMediaFrame(drawing, text.naturalWidth * scaleX, text.naturalHeight * scaleY),
    text,
  }
}
