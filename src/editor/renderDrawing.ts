import type { Drawing } from '../types/type'
import { drawingToPathData, escapeXml, formatSvgNumber, getDrawingBounds } from './document'

export interface DrawingRenderOptions {
  prefix?: string
  precision?: number
  interactive?: boolean
}

/** Shared SVG renderer keeps the canvas, SVG downloads and PNG rasterization identical. */
export function renderDrawingMarkup(drawing: Drawing, options: DrawingRenderOptions = {}): string {
  if (drawing.hidden || drawing.vertexs.length === 0) return ''
  // Precision controls path coordinates; ratios, opacity and native raster scales must stay exact.
  const f = (value: number) => formatSvgNumber(value)
  const encodedId = Array.from(`${options.prefix ?? 'drawing'}:${drawing.id}`)
    .map((character) => character.charCodeAt(0).toString(16))
    .join('-')
  const key = `node-${encodedId}`
  const defs: string[] = []
  let fill = drawing.type === 'SPLINE' ? 'none' : escapeXml(drawing.fill)
  if (drawing.gradient && drawing.type !== 'SPLINE') {
    const gradient = drawing.gradient
    const stops = gradient.stops
      .map((stop) => `<stop offset="${f(stop.offset)}" stop-color="${escapeXml(stop.color)}"/>`)
      .join('')
    if (gradient.type === 'radial') {
      defs.push(`<radialGradient id="${key}-gradient" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`)
    } else {
      const radians = (gradient.angle * Math.PI) / 180
      const x = Math.cos(radians) / 2
      const y = Math.sin(radians) / 2
      defs.push(
        `<linearGradient id="${key}-gradient" x1="${f(0.5 - x)}" y1="${f(0.5 - y)}" x2="${f(0.5 + x)}" y2="${f(
          0.5 + y,
        )}">${stops}</linearGradient>`,
      )
    }
    fill = `url(#${key}-gradient)`
  }
  if (drawing.clip) {
    const clip = {
      ...drawing,
      type: 'POLYGON' as const,
      vertexs: drawing.clip.vertexs,
      subpaths: drawing.clip.subpaths,
    }
    defs.push(
      `<clipPath id="${key}-clip" clipPathUnits="userSpaceOnUse"><path d="${drawingToPathData(
        clip,
        options.precision,
      )}" clip-rule="evenodd"/></clipPath>`,
    )
  }
  const effects = drawing.effects
  const hasEffects =
    effects &&
    (effects.brightness !== 1 ||
      effects.contrast !== 1 ||
      effects.saturation !== 1 ||
      effects.grayscale !== 0 ||
      effects.blur !== 0 ||
      effects.hue !== 0)
  if (hasEffects) {
    const bounds = getDrawingBounds(drawing)
    const components = (slope: number, intercept: number) =>
      `<feComponentTransfer>${['R', 'G', 'B']
        .map((channel) => `<feFunc${channel} type="linear" slope="${f(slope)}" intercept="${f(intercept)}"/>`)
        .join('')}</feComponentTransfer>`
    const parts: string[] = []
    if (effects.brightness !== 1) parts.push(components(effects.brightness, 0))
    if (effects.contrast !== 1) parts.push(components(effects.contrast, (1 - effects.contrast) / 2))
    if (effects.saturation !== 1) parts.push(`<feColorMatrix type="saturate" values="${f(effects.saturation)}"/>`)
    if (effects.grayscale !== 0) parts.push(`<feColorMatrix type="saturate" values="${f(1 - effects.grayscale)}"/>`)
    if (effects.hue !== 0) parts.push(`<feColorMatrix type="hueRotate" values="${f(effects.hue)}"/>`)
    if (effects.blur !== 0) parts.push(`<feGaussianBlur stdDeviation="${f(effects.blur)}"/>`)
    defs.push(
      `<filter id="${key}-effects" filterUnits="userSpaceOnUse" x="${f(bounds.minX)}" y="${f(bounds.minY)}" width="${f(
        bounds.width,
      )}" height="${f(bounds.height)}" color-interpolation-filters="sRGB">${parts.join('')}</filter>`,
    )
  }
  const stroke = `stroke="${escapeXml(drawing.stroke)}" stroke-width="${f(
    drawing.strokeWidth,
  )}" stroke-linejoin="round"`
  const marker = options.interactive ? ` data-drawing-id="${escapeXml(drawing.id)}"` : ''
  const pointer = options.interactive ? ` pointer-events="${drawing.locked ? 'none' : 'visiblePainted'}"` : ''
  let body: string
  if (drawing.type === 'TEXT' && drawing.text) {
    const text = drawing.text
    const x = text.align === 'center' ? text.naturalWidth / 2 : text.align === 'right' ? text.naturalWidth : 0
    const anchor = text.align === 'center' ? 'middle' : text.align === 'right' ? 'end' : 'start'
    const lines = text.content
      .split(/\r?\n/)
      .map(
        (line, index) =>
          `<tspan x="${f(x)}" y="${f(text.fontSize + index * text.fontSize * text.lineHeight)}">${escapeXml(
            line,
          )}</tspan>`,
      )
      .join('')
    body = `<text${marker}${pointer} transform="${nativeTransform(
      drawing,
      text.naturalWidth,
      text.naturalHeight,
      f,
    )}" fill="${fill}" ${stroke} font-family="${escapeXml(text.fontFamily)}" font-size="${f(
      text.fontSize,
    )}" font-weight="${f(text.fontWeight)}" font-style="${escapeXml(text.fontStyle)}" letter-spacing="${f(
      text.letterSpacing,
    )}" text-anchor="${anchor}" xml:space="preserve">${lines}</text>`
  } else if (drawing.type === 'IMAGE' && drawing.image) {
    const image = drawing.image
    // Attribute escaping alone is insufficient for href: allow only passive embedded rasters.
    const source = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.src) ? image.src : ''
    const crop = image.crop
    body = `<g transform="${nativeTransform(
      drawing,
      image.naturalWidth,
      image.naturalHeight,
      f,
    )}"><svg${marker}${pointer} x="0" y="0" width="${f(image.naturalWidth)}" height="${f(
      image.naturalHeight,
    )}" viewBox="${f(crop.x * image.naturalWidth)} ${f(crop.y * image.naturalHeight)} ${f(
      crop.width * image.naturalWidth,
    )} ${f(
      crop.height * image.naturalHeight,
    )}" preserveAspectRatio="none" overflow="hidden"><image${marker}${pointer} href="${escapeXml(source)}" width="${f(
      image.naturalWidth,
    )}" height="${f(image.naturalHeight)}" preserveAspectRatio="none"/></svg></g>`
    if (drawing.stroke !== 'none' && drawing.strokeWidth > 0) {
      body += `<path${marker}${pointer} d="${drawingToPathData(drawing, options.precision)}" fill="none" ${stroke}/>`
    }
  } else {
    body = `<path${marker}${pointer} d="${drawingToPathData(
      drawing,
      options.precision,
    )}" fill="${fill}" fill-rule="evenodd" ${stroke}${drawing.type === 'SPLINE' ? ' stroke-linecap="round"' : ''}/>`
  }
  const blend = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(drawing.blendMode ?? '')
    ? drawing.blendMode
    : 'normal'
  const clip = drawing.clip ? ` clip-path="url(#${key}-clip)"` : ''
  const filter = hasEffects ? ` filter="url(#${key}-effects)"` : ''
  return `${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<g${marker}${pointer} opacity="${f(
    drawing.opacity,
  )}" style="mix-blend-mode:${blend}"${clip}${filter}>${body}</g>`
}

function nativeTransform(drawing: Drawing, width: number, height: number, format: (value: number) => string): string {
  // Media corners follow shape creation: TL, BL, BR, TR. The signed axes retain flips.
  const [origin, bottom, , right] = drawing.vertexs
  if (origin && bottom && right) {
    return `matrix(${format((right.x - origin.x) / width)} ${format((right.y - origin.y) / width)} ${format(
      (bottom.x - origin.x) / height,
    )} ${format((bottom.y - origin.y) / height)} ${format(origin.x)} ${format(origin.y)})`
  }
  return 'matrix(1 0 0 1 0 0)'
}
