import type paper from 'paper'
import type { Drawing } from '@/types/type'
import { MAX_DOCUMENT_BYTES, type EditorDocument } from '@/editor/document'
import { createVectorScope, paperDrawing, pathContours, vectorId } from './boolean'

const allowedTags = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'linearGradient',
  'radialGradient',
  'stop',
])
const paintNames: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  purple: '#800080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  teal: '#008080',
  navy: '#000080',
  lime: '#00ff00',
  maroon: '#800000',
  olive: '#808000',
  aqua: '#00ffff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  rebeccapurple: '#663399',
  transparent: '#00000000',
}
type Style = Record<string, string>

function fail(message: string): never {
  throw new Error(`SVG import: ${message}`)
}

export function validateSvgSource(text: string): void {
  if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) fail('files must be smaller than 10 MB.')
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('document types and XML entities are not supported.')
  if (text.length === 0) fail('the file is empty.')
}

function finite(value: string | null, fallback = 0): number {
  if (value === null || value.trim() === '') return fallback
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i.test(value.trim())) {
    fail(`unsupported coordinate "${value}". Use numeric or px coordinates.`)
  }
  const number = Number(value.replace(/px$/i, ''))
  if (!Number.isFinite(number) || Math.abs(number) > 10000000) fail('coordinates are outside the supported range.')
  return number
}

function fraction(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const number = value.endsWith('%') ? finite(value.slice(0, -1)) / 100 : finite(value)
  return Math.max(0, Math.min(1, number))
}

function color(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'none') return 'none'
  if (/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(normalized)) return normalized
  if (paintNames[normalized]) return paintNames[normalized]
  const rgb = normalized.match(
    /^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/,
  )
  if (rgb) {
    const byte = (value: string, percentage: string) =>
      Math.max(0, Math.min(255, Math.round(Number(value) * (percentage ? 2.55 : 1))))
        .toString(16)
        .padStart(2, '0')
    return `#${byte(rgb[1], rgb[2])}${byte(rgb[3], rgb[4])}${byte(rgb[5], rgb[6])}${
      rgb[7] === undefined
        ? ''
        : Math.round(fraction(rgb[7] + rgb[8], 1) * 255)
            .toString(16)
            .padStart(2, '0')
    }`
  }
  fail(`unsupported paint "${value}". Use hex, RGB, or a standard basic color.`)
}

function alpha(paint: string, opacity: number): string {
  if (paint === 'none' || opacity === 1) return paint
  let hex = paint.slice(1)
  if (hex.length === 3 || hex.length === 4)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  const currentAlpha = hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1
  return `#${hex.slice(0, 6)}${Math.round(currentAlpha * opacity * 255)
    .toString(16)
    .padStart(2, '0')}`
}

function properties(element: Element, inherited: Style): Style {
  const style = { ...inherited }
  for (const name of [
    'fill',
    'stroke',
    'stroke-width',
    'fill-rule',
    'fill-opacity',
    'stroke-opacity',
    'visibility',
    'color',
  ]) {
    if (element.hasAttribute(name)) style[name] = element.getAttribute(name)!
  }
  for (const declaration of (element.getAttribute('style') ?? '').split(';').filter((value) => value.trim())) {
    const separator = declaration.indexOf(':')
    if (separator < 0) fail('invalid inline style declaration.')
    const key = declaration.slice(0, separator).trim()
    const value = declaration.slice(separator + 1).trim()
    if (['filter', 'clip-path', 'mask', 'mix-blend-mode'].includes(key) && value !== 'none' && value !== 'normal') {
      fail(`${key} is not supported; flatten or remove this effect first.`)
    }
    if (
      [
        'fill',
        'stroke',
        'stroke-width',
        'fill-rule',
        'fill-opacity',
        'stroke-opacity',
        'visibility',
        'color',
        'opacity',
        'display',
        'stop-color',
        'stop-opacity',
      ].includes(key)
    )
      style[key] = value
    else if (
      ![
        'filter',
        'clip-path',
        'mask',
        'mix-blend-mode',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-miterlimit',
        'isolation',
      ].includes(key)
    )
      fail(`the inline style property "${key}" is not supported.`)
  }
  return style
}

export function svgTransform(scope: paper.PaperScope, source: string | null): paper.Matrix {
  const matrix = new scope.Matrix()
  if (!source) return matrix
  const expression = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  let consumed = ''
  while ((match = expression.exec(source))) {
    consumed += match[0]
    const values = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((value) => finite(value))
    const local = new scope.Matrix()
    switch (match[1]) {
      case 'matrix':
        if (values.length !== 6) fail('matrix transforms need six numbers.')
        local.set(...(values as [number, number, number, number, number, number]))
        break
      case 'translate':
        if (values.length < 1 || values.length > 2) fail('invalid translate transform.')
        local.translate(values[0], values[1] ?? 0)
        break
      case 'scale':
        if (values.length < 1 || values.length > 2) fail('invalid scale transform.')
        local.scale(values[0], values[1] ?? values[0])
        break
      case 'rotate':
        if (values.length !== 1 && values.length !== 3) fail('invalid rotate transform.')
        local.rotate(values[0], new scope.Point(values[1] ?? 0, values[2] ?? 0))
        break
      case 'skewX':
      case 'skewY': {
        if (values.length !== 1) fail('invalid skew transform.')
        const tangent = Math.tan((values[0] * Math.PI) / 180)
        local.set(1, match[1] === 'skewY' ? tangent : 0, match[1] === 'skewX' ? tangent : 0, 1, 0, 0)
        break
      }
      default:
        fail(`unsupported transform "${match[1]}".`)
    }
    matrix.append(local)
  }
  if (source.replace(/[\s,]/g, '') !== consumed.replace(/[\s,]/g, '')) fail('invalid transform syntax.')
  return matrix
}

function primitive(scope: paper.PaperScope, element: Element): paper.PathItem | null {
  const number = (name: string, fallback = 0) => finite(element.getAttribute(name), fallback)
  switch (element.localName) {
    case 'path': {
      const data = element.getAttribute('d') ?? ''
      if ((data.match(/[a-z]/gi) ?? []).length > 100000) fail('a path has too many commands.')
      if (/[^mlhvcsqtaz\d\s.,+\-e]/i.test(data)) fail('a path contains invalid commands.')
      const numbers = data.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []
      if (numbers.length > 600000) fail('a path has too many coordinates.')
      numbers.forEach((value) => finite(value))
      return new scope.CompoundPath({ pathData: data, insert: false })
    }
    case 'rect': {
      const width = number('width'),
        height = number('height')
      if (width < 0 || height < 0) fail('rectangle dimensions cannot be negative.')
      const rx = Math.min(width / 2, Math.max(0, number('rx', number('ry'))))
      const ry = Math.min(height / 2, Math.max(0, number('ry', rx)))
      return new scope.Path.Rectangle({
        rectangle: new scope.Rectangle(number('x'), number('y'), width, height),
        radius: new scope.Size(rx, ry),
        insert: false,
      })
    }
    case 'circle':
    case 'ellipse': {
      const rx = element.localName === 'circle' ? number('r') : number('rx')
      const ry = element.localName === 'circle' ? rx : number('ry')
      if (rx < 0 || ry < 0) fail('ellipse radii cannot be negative.')
      return new scope.Path.Ellipse({ center: [number('cx'), number('cy')], radius: [rx, ry], insert: false })
    }
    case 'line':
      return new scope.Path.Line({
        from: [number('x1'), number('y1')],
        to: [number('x2'), number('y2')],
        insert: false,
      })
    case 'polyline':
    case 'polygon': {
      const coordinates = (element.getAttribute('points') ?? '')
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((value) => finite(value))
      if (coordinates.length % 2) fail('point lists need paired x and y coordinates.')
      if (coordinates.length > 200000) fail('a shape has too many points.')
      const path = new scope.Path({ insert: false, closed: element.localName === 'polygon' })
      for (let index = 0; index < coordinates.length; index += 2)
        path.add(new scope.Point(coordinates[index], coordinates[index + 1]))
      return path
    }
    default:
      return null
  }
}

/** Imports a deliberately explicit vector subset, with no DOM injection or external fetching. */
export async function importSvg(text: string): Promise<Drawing[]> {
  validateSvgSource(text)
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg')
    fail('the file is not valid SVG XML.')
  const elements = [xml.documentElement, ...Array.from(xml.documentElement.querySelectorAll('*'))]
  if (elements.length > 12000) fail('the file contains too many elements.')
  for (const element of elements) {
    if (!allowedTags.has(element.localName))
      fail(`<${element.localName}> is not supported. Import plain vector shapes and paths.`)
    if (element.localName === 'svg' && element !== xml.documentElement) fail('nested SVG viewports are not supported.')
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase()
      if (
        name.startsWith('on') ||
        name === 'href' ||
        (/(?:javascript|data|https?|file):/i.test(attribute.value) && !attribute.name.startsWith('xmlns'))
      )
        fail('scripts, links, and external resources are not allowed.')
      if (
        ['filter', 'clip-path', 'mask', 'stroke-dasharray', 'vector-effect'].includes(name) &&
        !['none', ''].includes(attribute.value)
      )
        fail(`${attribute.name} is not supported; remove it or convert its appearance to paths.`)
    }
  }
  const gradients = new Map<string, NonNullable<Drawing['gradient']>>()
  for (const element of elements.filter((node) => ['linearGradient', 'radialGradient'].includes(node.localName))) {
    if (element.getAttribute('gradientUnits') === 'userSpaceOnUse' || element.hasAttribute('gradientTransform'))
      fail('gradients must use object bounding box coordinates without a gradient transform.')
    const stops = Array.from(element.children)
      .map((stop) => {
        const style = properties(stop, {})
        return {
          offset: fraction(stop.getAttribute('offset') ?? '0', 0),
          color: alpha(
            color(style['stop-color'] ?? stop.getAttribute('stop-color') ?? '#000000'),
            fraction(style['stop-opacity'] ?? stop.getAttribute('stop-opacity') ?? '1', 1),
          ),
        }
      })
      .sort((a, b) => a.offset - b.offset)
    if (stops.length < 2 || stops.length > 16) fail('gradients need between 2 and 16 color stops.')
    const coordinate = (name: string, fallback: number) => fraction(element.getAttribute(name) ?? undefined, fallback)
    const angle =
      (Math.atan2(coordinate('y2', 0) - coordinate('y1', 0), coordinate('x2', 1) - coordinate('x1', 0)) * 180) / Math.PI
    gradients.set(element.getAttribute('id') ?? '', {
      type: element.localName === 'radialGradient' ? 'radial' : 'linear',
      angle,
      stops,
    })
  }
  const scope = await createVectorScope()
  const drawings: Drawing[] = []
  let vertexCount = 0
  try {
    const walk = (
      element: Element,
      inherited: Style,
      parentMatrix: paper.Matrix,
      parentOpacity: number,
      groupId?: string,
      parentHidden = false,
    ) => {
      if (['defs', 'title', 'desc', 'linearGradient', 'radialGradient', 'stop'].includes(element.localName)) return
      const style = properties(element, inherited)
      const ownStyle = properties(element, {})
      const opacity = parentOpacity * fraction(ownStyle.opacity ?? element.getAttribute('opacity') ?? '1', 1)
      const hidden =
        parentHidden ||
        ownStyle.display === 'none' ||
        element.getAttribute('display') === 'none' ||
        style.visibility === 'hidden'
      const matrix = parentMatrix.clone().append(svgTransform(scope, element.getAttribute('transform')))
      const currentGroup = groupId ?? (element.localName === 'g' ? vectorId('group') : undefined)
      const item = primitive(scope, element)
      if (item) {
        item.transform(matrix)
        if (item.className === 'CompoundPath' && pathContours(item).every((path) => path.closed))
          item.reorient(style['fill-rule'] !== 'evenodd', true)
        const fill = style.fill ?? '#000000'
        const reference = fill.match(/^url\(\s*['"]?#([\w.:-]+)['"]?\s*\)$/)
        const gradient = reference ? gradients.get(reference[1]) : undefined
        if (reference && !gradient) fail(`gradient "${reference[1]}" was not found.`)
        const parts = pathContours(item)
        const mixed = parts.some((path) => path.closed) && parts.some((path) => !path.closed)
        for (const part of mixed ? parts : [item]) {
          const drawing = paperDrawing(part, {
            name: (element.getAttribute('aria-label') ?? element.getAttribute('id') ?? element.localName).slice(0, 120),
            groupId: currentGroup,
            hidden,
            opacity,
            fill: reference
              ? gradient!.stops[0].color
              : alpha(
                  color(fill === 'currentColor' ? style.color ?? '#000000' : fill),
                  fraction(style['fill-opacity'], 1),
                ),
            stroke: alpha(
              color((style.stroke ?? 'none') === 'currentColor' ? style.color ?? '#000000' : style.stroke ?? 'none'),
              fraction(style['stroke-opacity'], 1),
            ),
            strokeWidth:
              finite(style['stroke-width'] ?? '1') * Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)),
            ...(gradient
              ? {
                  gradient: {
                    ...gradient,
                    stops: gradient.stops.map((stop) => ({
                      ...stop,
                      color: alpha(stop.color, fraction(style['fill-opacity'], 1)),
                    })),
                  },
                }
              : {}),
          })
          if (drawing) {
            vertexCount +=
              drawing.vertexs.length + (drawing.subpaths ?? []).reduce((sum, contour) => sum + contour.length, 0)
            if (vertexCount > 100000 || drawings.length >= 1000)
              fail('the file exceeds 1,000 shapes or 100,000 points.')
            if (
              [...drawing.vertexs, ...(drawing.subpaths ?? []).flat()].some(
                (point) =>
                  !Number.isFinite(point.x) ||
                  !Number.isFinite(point.y) ||
                  Math.abs(point.x) > 10000000 ||
                  Math.abs(point.y) > 10000000,
              )
            )
              fail('transformed coordinates are outside the supported range.')
            drawings.push(drawing)
          }
        }
      }
      for (const child of Array.from(element.children)) walk(child, style, matrix, opacity, currentGroup, hidden)
    }
    walk(xml.documentElement, {}, new scope.Matrix(), 1)
    if (!drawings.length) fail('no editable vector shapes were found.')
    return drawings
  } finally {
    scope.remove()
  }
}

export function appendImportedSvg(document: EditorDocument, drawings: Drawing[]): EditorDocument {
  const groupIds = Array.from(new Set(drawings.map((drawing) => drawing.groupId).filter((id): id is string => !!id)))
  return {
    ...document,
    drawings: [...document.drawings, ...drawings],
    groups: [
      ...document.groups,
      ...groupIds
        .filter((id) => !document.groups.some((group) => group.id === id))
        .map((id) => ({ id, name: 'Imported group' })),
    ],
  }
}
