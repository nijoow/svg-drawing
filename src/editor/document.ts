import type { Drawing, Vertex } from '../types/type'
import { renderDrawingMarkup } from './renderDrawing'

export const DOCUMENT_VERSION = 2
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const MAX_DRAWINGS = 1000
const MAX_VERTICES = 100000
const MAX_COORDINATE = 10000000
const INVALID_NAME_CHARACTERS = /[\u0000-\u001f\u007f\uFFFE\uFFFF]/

export interface EditorDocument {
  version: typeof DOCUMENT_VERSION
  id: string
  name: string
  canvas: { width: number; height: number }
  drawings: Drawing[]
  groups: { id: string; name: string; parentId?: string }[]
  artboards: { id: string; name: string; x: number; y: number; width: number; height: number }[]
}

export interface DrawingBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentValidationError'
  }
}

export function createDocument(name = 'Untitled'): EditorDocument {
  return {
    version: DOCUMENT_VERSION,
    id: globalThis.crypto?.randomUUID?.() ?? `document-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: normalizeDocumentName(name),
    canvas: { width: 1600, height: 900 },
    drawings: [],
    groups: [],
    artboards: [],
  }
}

export function normalizeDocumentName(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f\u007f\uFFFE\uFFFF]/g, '')
      .trim()
      .slice(0, 120) || 'Untitled'
  )
}

function fail(message: string): never {
  throw new DocumentValidationError(message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function number(value: unknown, label: string, min = -MAX_COORDINATE, max = MAX_COORDINATE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label} is outside the supported range.`)
  }
  return value
}

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) fail(`${label} is invalid.`)
  return value
}

function label(value: unknown, field: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || INVALID_NAME_CHARACTERS.test(value)) {
    fail(`${field} is invalid.`)
  }
  return value
}

function choice<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) fail(`${field} is invalid.`)
  return value as T
}

// Imported paint values must never resolve external resources or inject SVG attributes.
function paint(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} is invalid.`)
  if (
    /^(?:none|transparent|black|white)$/i.test(value) ||
    /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
  ) {
    return value
  }
  fail(`${label} must be a hex color or a supported plain color.`)
}

function parseVertex(value: unknown, drawingType: Drawing['type']): Vertex {
  const v = record(value, 'Vertex')
  const type = v.type
  if (drawingType === 'SPLINE' ? type !== null : !['M', 'L', 'C', 'S'].includes(type as string)) {
    fail('Vertex command is invalid for this drawing.')
  }
  const vertex: Vertex = {
    id: id(v.id, 'Vertex ID'),
    x: number(v.x, 'Vertex x'),
    y: number(v.y, 'Vertex y'),
    type: type as Vertex['type'],
  }
  for (const [xKey, yKey] of [
    ['currentHandlerX', 'currentHandlerY'],
    ['nextHandlerX', 'nextHandlerY'],
  ] as const) {
    if (v[xKey] !== undefined || v[yKey] !== undefined) {
      vertex[xKey] = number(v[xKey], xKey)
      vertex[yKey] = number(v[yKey], yKey)
    }
  }
  if ((type === 'C' || type === 'S') && vertex.currentHandlerX === undefined) {
    fail('Curve control points are missing.')
  }
  return vertex
}

function parseContour(value: unknown, type: Drawing['type'], minimum = 3): Vertex[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_VERTICES) {
    fail('Drawing has an invalid number of vertices.')
  }
  const vertices = value.map((vertex) => parseVertex(vertex, type))
  if (new Set(vertices.map((vertex) => vertex.id)).size !== vertices.length) fail('Vertex IDs must be unique.')
  vertices.forEach((vertex, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length]
    if (vertex.type === 'C' && previous.nextHandlerX === undefined) fail('Curve control points are missing.')
  })
  return vertices
}

function parseSubpaths(value: unknown): Vertex[][] {
  if (!Array.isArray(value) || value.length > 1000) fail('Drawing has too many contours.')
  return value.map((contour) => parseContour(contour, 'POLYGON'))
}

export function embeddedImageDimensions(source: string): { width: number; height: number } {
  const encoded = source.slice(source.indexOf(',') + 1)
  let data: string
  try {
    data = atob(source.startsWith('data:image/jpeg;') ? encoded : encoded.slice(0, 64))
  } catch {
    fail('Image data is invalid.')
  }
  const byte = (offset: number) => data.charCodeAt(offset)
  const be16 = (offset: number) => byte(offset) * 256 + byte(offset + 1)
  const be32 = (offset: number) => be16(offset) * 65536 + be16(offset + 2)
  const le24 = (offset: number) => byte(offset) + byte(offset + 1) * 256 + byte(offset + 2) * 65536
  if (source.startsWith('data:image/png;') && data.startsWith('\x89PNG\r\n\x1a\n') && data.slice(12, 16) === 'IHDR') {
    return { width: be32(16), height: be32(20) }
  }
  if (source.startsWith('data:image/webp;') && data.startsWith('RIFF') && data.slice(8, 12) === 'WEBP') {
    if (data.slice(12, 16) === 'VP8X') return { width: le24(24) + 1, height: le24(27) + 1 }
    if (data.slice(12, 16) === 'VP8L' && byte(20) === 0x2f) {
      return {
        width: 1 + (byte(21) | ((byte(22) & 63) << 8)),
        height: 1 + ((byte(22) >> 6) | (byte(23) << 2) | ((byte(24) & 15) << 10)),
      }
    }
    if (data.slice(12, 16) === 'VP8 ' && data.slice(23, 26) === '\x9d\x01\x2a') {
      return { width: (byte(26) + byte(27) * 256) & 16383, height: (byte(28) + byte(29) * 256) & 16383 }
    }
  }
  if (source.startsWith('data:image/jpeg;') && data.startsWith('\xff\xd8\xff')) {
    let offset = 2
    while (offset + 4 < data.length) {
      if (byte(offset++) !== 0xff) break
      while (byte(offset) === 0xff) offset++
      const marker = byte(offset++)
      if (marker === 0xd9 || marker === 0xda) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      const length = be16(offset)
      if (length < 2 || offset + length > data.length) break
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) &&
        length >= 8
      ) {
        return { width: be16(offset + 5), height: be16(offset + 3) }
      }
      offset += length
    }
  }
  fail('Image dimensions could not be read from the embedded raster file.')
}

function parseImage(value: unknown): NonNullable<Drawing['image']> {
  const image = record(value, 'Image')
  // SVG data URLs and remote URLs can contain active/external content. Raster bytes only.
  if (
    typeof image.src !== 'string' ||
    image.src.length > 9 * 1024 * 1024 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.src)
  ) {
    fail('Images must be embedded PNG, JPEG or WebP files.')
  }
  if ((image.src.length - image.src.indexOf(',') - 1) % 4 !== 0) fail('Image data is invalid.')
  const actual = embeddedImageDimensions(image.src)
  const naturalWidth = number(image.naturalWidth, 'Image width', 1, 32768)
  const naturalHeight = number(image.naturalHeight, 'Image height', 1, 32768)
  if (!Number.isInteger(naturalWidth) || !Number.isInteger(naturalHeight) || naturalWidth * naturalHeight > 50000000) {
    fail('Images must contain at most 50 million pixels.')
  }
  const dimensionsMatch = actual.width === naturalWidth && actual.height === naturalHeight
  // Browsers honor JPEG EXIF orientation; a quarter-turn swaps the reported natural dimensions.
  const jpegOrientationMatch =
    image.src.startsWith('data:image/jpeg;') && actual.width === naturalHeight && actual.height === naturalWidth
  if (!dimensionsMatch && !jpegOrientationMatch) fail('Image dimensions do not match its embedded file.')
  const crop = record(image.crop, 'Image crop')
  const result = {
    src: image.src,
    naturalWidth,
    naturalHeight,
    crop: {
      x: number(crop.x, 'Crop x', 0, 1),
      y: number(crop.y, 'Crop y', 0, 1),
      width: number(crop.width, 'Crop width', 0.000001, 1),
      height: number(crop.height, 'Crop height', 0.000001, 1),
    },
  }
  if (result.crop.x + result.crop.width > 1.000000001 || result.crop.y + result.crop.height > 1.000000001) {
    fail('Image crop must stay inside the source image.')
  }
  return result
}

function parseDrawing(value: unknown): Drawing {
  const d = record(value, 'Drawing')
  if (!['POLYGON', 'PATH', 'ELLIPSE', 'SPLINE', 'TEXT', 'IMAGE'].includes(d.type as string) || d.subType !== null) {
    fail('Unsupported drawing type.')
  }
  const type = d.type as Drawing['type']
  const minimum = type === 'POLYGON' ? 3 : ['ELLIPSE', 'TEXT', 'IMAGE'].includes(type) ? 4 : 2
  const vertexs = parseContour(d.vertexs, type, minimum)
  if (type === 'ELLIPSE' && (vertexs.length !== 4 || vertexs.some((vertex) => vertex.type !== 'C'))) {
    fail('Ellipse geometry is invalid.')
  }
  if (
    ['TEXT', 'IMAGE'].includes(type) &&
    (vertexs.length !== 4 || vertexs.some((v) => v.type !== 'M' && v.type !== 'L'))
  ) {
    fail('Text and image geometry must have four rectangle corners.')
  }
  const center = record(d.center, 'Drawing center')
  const result: Drawing = {
    id: id(d.id, 'Drawing ID'),
    type,
    subType: null,
    vertexs,
    width: number(d.width, 'Drawing width', 0, MAX_COORDINATE * 2),
    height: number(d.height, 'Drawing height', 0, MAX_COORDINATE * 2),
    center: { x: number(center.x, 'Center x'), y: number(center.y, 'Center y') },
    rotate: number(d.rotate, 'Rotation'),
    fill: paint(d.fill, 'Fill'),
    stroke: paint(d.stroke, 'Stroke'),
    strokeWidth: number(d.strokeWidth, 'Stroke width', 0, 10000),
    opacity: number(d.opacity, 'Opacity', 0, 1),
  }
  if (d.name !== undefined) result.name = label(d.name, 'Drawing name')
  for (const key of ['hidden', 'locked'] as const) {
    if (d[key] !== undefined) {
      const value = d[key]
      if (typeof value !== 'boolean') fail(`${key} must be a boolean.`)
      result[key] = value
    }
  }
  for (const key of ['groupId', 'artboardId'] as const) {
    if (d[key] !== undefined) result[key] = id(d[key], key)
  }
  if (d.subpaths !== undefined) {
    result.subpaths = parseSubpaths(d.subpaths)
    const vertexIds = [result.vertexs, ...result.subpaths].flat().map((vertex) => vertex.id)
    if (new Set(vertexIds).size !== vertexIds.length) fail('Vertex IDs must be unique across drawing contours.')
  }
  if (d.gradient !== undefined) {
    const gradient = record(d.gradient, 'Gradient')
    if (!Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 32) {
      fail('Gradients need between 2 and 32 stops.')
    }
    const stops = gradient.stops.map((value) => {
      const stop = record(value, 'Gradient stop')
      return { offset: number(stop.offset, 'Gradient offset', 0, 1), color: paint(stop.color, 'Gradient color') }
    })
    if (stops.some((stop, index) => index > 0 && stop.offset < stops[index - 1].offset))
      fail('Gradient stops must be ordered.')
    result.gradient = {
      type: choice(gradient.type, ['linear', 'radial'], 'Gradient type'),
      angle: number(gradient.angle, 'Gradient angle'),
      stops,
    }
  }
  if (d.clip !== undefined) {
    const clip = record(d.clip, 'Clip')
    result.clip = { vertexs: parseContour(clip.vertexs, 'POLYGON') }
    if (clip.subpaths !== undefined) result.clip.subpaths = parseSubpaths(clip.subpaths)
  }
  if (d.blendMode !== undefined)
    result.blendMode = choice(
      d.blendMode,
      ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const,
      'Blend mode',
    )
  if (d.effects !== undefined) {
    const effects = record(d.effects, 'Effects')
    result.effects = {
      brightness: number(effects.brightness, 'Brightness', 0, 4),
      contrast: number(effects.contrast, 'Contrast', 0, 4),
      saturation: number(effects.saturation, 'Saturation', 0, 4),
      grayscale: number(effects.grayscale, 'Grayscale', 0, 1),
      blur: number(effects.blur, 'Blur', 0, 100),
      hue: number(effects.hue, 'Hue', -360, 360),
    }
  }
  if (type === 'TEXT') {
    const text = record(d.text, 'Text')
    if (
      typeof text.content !== 'string' ||
      text.content.length > 10000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uFFFE\uFFFF]/.test(text.content)
    ) {
      fail('Text content is invalid or too long.')
    }
    result.text = {
      content: text.content,
      fontFamily: label(text.fontFamily, 'Font family', 200),
      fontSize: number(text.fontSize, 'Font size', 1, 10000),
      fontWeight: number(text.fontWeight, 'Font weight', 100, 900),
      fontStyle: choice(text.fontStyle, ['normal', 'italic'], 'Font style'),
      align: choice(text.align, ['left', 'center', 'right'], 'Text alignment'),
      lineHeight: number(text.lineHeight, 'Line height', 0.5, 5),
      letterSpacing: number(text.letterSpacing, 'Letter spacing', -1000, 1000),
      naturalWidth: number(text.naturalWidth, 'Text natural width', 1, MAX_COORDINATE),
      naturalHeight: number(text.naturalHeight, 'Text natural height', 1, MAX_COORDINATE),
    }
  }
  if (type === 'IMAGE') result.image = parseImage(d.image)
  return result
}

/** Parse into a fresh, whitelisted model before replacing any current editor state. */
export function parseDocument(text: string): EditorDocument {
  if (
    typeof text !== 'string' ||
    text.length > MAX_DOCUMENT_BYTES ||
    new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES
  ) {
    fail('The document exceeds the 10 MB file limit.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('The file is not valid JSON.')
  }
  const doc = record(parsed, 'Document')
  if (doc.version !== 1 && doc.version !== DOCUMENT_VERSION) fail('This document version is not supported.')
  if (
    typeof doc.name !== 'string' ||
    !doc.name.trim() ||
    doc.name.length > 120 ||
    INVALID_NAME_CHARACTERS.test(doc.name)
  ) {
    fail('Document name is invalid.')
  }
  const canvas = record(doc.canvas, 'Canvas')
  if (!Array.isArray(doc.drawings) || doc.drawings.length > MAX_DRAWINGS) fail('Document has too many drawings.')
  let vertexCount = 0
  const drawings = doc.drawings.map((value) => {
    const drawing = record(value, 'Drawing')
    vertexCount += Array.isArray(drawing.vertexs) ? drawing.vertexs.length : 0
    for (const paths of [drawing.subpaths, recordOptional(drawing.clip)?.subpaths]) {
      if (Array.isArray(paths)) {
        paths.forEach((path) => {
          vertexCount += Array.isArray(path) ? path.length : 0
        })
      }
    }
    const clipVertices = recordOptional(drawing.clip)?.vertexs
    vertexCount += Array.isArray(clipVertices) ? clipVertices.length : 0
    if (vertexCount > MAX_VERTICES) fail('Document has too many vertices.')
    return parseDrawing(drawing)
  })
  if (new Set(drawings.map((drawing) => drawing.id)).size !== drawings.length) fail('Drawing IDs must be unique.')
  const rawGroups = doc.version === 1 ? [] : doc.groups
  const rawArtboards = doc.version === 1 ? [] : doc.artboards
  if (!Array.isArray(rawGroups) || rawGroups.length > MAX_DRAWINGS) fail('Document has too many groups.')
  if (!Array.isArray(rawArtboards) || rawArtboards.length > 100) fail('Document has too many artboards.')
  const groups: EditorDocument['groups'] = rawGroups.map((value) => {
    const group = record(value, 'Group')
    const result: EditorDocument['groups'][number] = {
      id: id(group.id, 'Group ID'),
      name: label(group.name, 'Group name'),
    }
    if (group.parentId !== undefined) result.parentId = id(group.parentId, 'Parent group ID')
    return result
  })
  const artboards = rawArtboards.map((value) => {
    const board = record(value, 'Artboard')
    return {
      id: id(board.id, 'Artboard ID'),
      name: label(board.name, 'Artboard name'),
      x: number(board.x, 'Artboard x'),
      y: number(board.y, 'Artboard y'),
      width: number(board.width, 'Artboard width', 1, MAX_COORDINATE),
      height: number(board.height, 'Artboard height', 1, MAX_COORDINATE),
    }
  })
  const groupMap = new Map(groups.map((group) => [group.id, group]))
  const boardIds = new Set(artboards.map((board) => board.id))
  const allIds = [
    ...drawings.map((drawing) => drawing.id),
    ...Array.from(groupMap.keys()),
    ...artboards.map((board) => board.id),
  ]
  if (groupMap.size !== groups.length || boardIds.size !== artboards.length || new Set(allIds).size !== allIds.length) {
    fail('Drawing, group and artboard IDs must be unique.')
  }
  groups.forEach((group) => {
    const visited = new Set([group.id])
    let parentId = group.parentId
    while (parentId) {
      if (visited.has(parentId)) fail('Group hierarchy must not contain cycles.')
      visited.add(parentId)
      const parent = groupMap.get(parentId)
      if (!parent) fail('Parent group does not exist.')
      parentId = parent.parentId
    }
  })
  drawings.forEach((drawing) => {
    if (drawing.groupId && !groupMap.has(drawing.groupId)) fail('Drawing group does not exist.')
    if (drawing.artboardId && !boardIds.has(drawing.artboardId)) fail('Drawing artboard does not exist.')
  })
  return {
    version: DOCUMENT_VERSION,
    id: id(doc.id, 'Document ID'),
    name: doc.name.trim(),
    canvas: {
      width: number(canvas.width, 'Canvas width', 1, MAX_COORDINATE),
      height: number(canvas.height, 'Canvas height', 1, MAX_COORDINATE),
    },
    drawings,
    groups,
    artboards,
  }
}

function recordOptional(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

export function serializeDocument(doc: EditorDocument): string {
  // The same validation protects both downloaded documents and autosave recovery.
  // Compact output remains within the same byte limit enforced when reopening.
  return JSON.stringify(parseDocument(JSON.stringify(doc)))
}

type Position = { x: number; y: number }
type PathCommand = { type: 'M' | 'L' | 'C' | 'S' | 'Z'; points: Position[] }

function control(current: Position, previous = current, next = current): Position {
  return { x: current.x + (next.x - previous.x) * 0.2, y: current.y + (next.y - previous.y) * 0.2 }
}

function contourCommands(vertices: Vertex[], type: Drawing['type']): PathCommand[] {
  if (!vertices.length || vertices.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y))) return []
  if (type === 'SPLINE') {
    return vertices.map((vertex, index) => {
      if (index === 0) return { type: 'M', points: [vertex] }
      const previous = vertices[index - 1]
      return {
        type: 'C',
        points: [
          control(previous, vertices[index - 2] ?? previous, vertex),
          control(vertex, previous, vertices[index + 1] ?? vertex),
          vertex,
        ],
      }
    })
  }
  const path: PathCommand[] = [{ type: 'M', points: [vertices[vertices.length - 1]] }]
  vertices.forEach((vertex, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length]
    const currentHandle = { x: vertex.currentHandlerX ?? vertex.x, y: vertex.currentHandlerY ?? vertex.y }
    if (vertex.type === 'C') {
      path.push({
        type: 'C',
        points: [
          { x: previous.nextHandlerX ?? previous.x, y: previous.nextHandlerY ?? previous.y },
          currentHandle,
          vertex,
        ],
      })
    } else if (vertex.type === 'S') {
      path.push({ type: 'S', points: [currentHandle, vertex] })
    } else {
      path.push({ type: vertex.type === 'M' ? 'M' : 'L', points: [vertex] })
    }
  })
  if (['POLYGON', 'ELLIPSE', 'TEXT', 'IMAGE'].includes(type)) path.push({ type: 'Z', points: [] })
  return path
}

function commands(drawing: Drawing): PathCommand[] {
  return [
    contourCommands(drawing.vertexs, drawing.type),
    ...(drawing.subpaths ?? []).map((vertices) => contourCommands(vertices, 'POLYGON')),
  ].flat()
}

export function formatSvgNumber(value: number, precision?: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(precision === undefined ? value : Number(value.toFixed(precision)))
}

export function drawingToPathData(drawing: Drawing, precision?: number): string {
  return commands(drawing)
    .map(
      ({ type, points }) =>
        `${type}${
          points.length
            ? ` ${points
                .map(({ x, y }) => `${formatSvgNumber(x, precision)} ${formatSvgNumber(y, precision)}`)
                .join(' ')}`
            : ''
        }`,
    )
    .join(' ')
}

/** A conservative curve hull, including reflected S handles and the visible stroke. */
export function getDrawingBounds(drawing: Drawing): DrawingBounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let cursor: Position | undefined
  let previousControl: Position | undefined
  const include = (point: Position) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  for (const command of commands(drawing)) {
    if (command.type === 'S' && cursor) {
      include(previousControl ? { x: 2 * cursor.x - previousControl.x, y: 2 * cursor.y - previousControl.y } : cursor)
    }
    command.points.forEach(include)
    previousControl = ['C', 'S'].includes(command.type) ? command.points[command.points.length - 2] : undefined
    cursor = command.points[command.points.length - 1] ?? cursor
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 }
  const strokeScale =
    drawing.type === 'TEXT' && drawing.text && drawing.vertexs.length === 4
      ? Math.max(
          Math.hypot(drawing.vertexs[3].x - drawing.vertexs[0].x, drawing.vertexs[3].y - drawing.vertexs[0].y) /
            drawing.text.naturalWidth,
          Math.hypot(drawing.vertexs[1].x - drawing.vertexs[0].x, drawing.vertexs[1].y - drawing.vertexs[0].y) /
            drawing.text.naturalHeight,
        )
      : 1
  const padding =
    (drawing.stroke !== 'none' && Number.isFinite(drawing.strokeWidth)
      ? (Math.max(0, drawing.strokeWidth) * strokeScale) / 2
      : 0) +
    Math.max(0, drawing.effects?.blur ?? 0) * 3
  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding
  // Zero-width/height paths still need a finite, nonempty SVG viewport.
  if (maxX === minX) maxX = minX + 1
  if (maxY === minY) maxY = minY + 1
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!),
  )
}

export interface SvgExportOptions {
  artboardId?: string
  precision?: number
}

export function exportDocumentSvg(document: EditorDocument, options: SvgExportOptions = {}): string {
  const doc = parseDocument(JSON.stringify(document))
  const precision = options.precision
  if (precision !== undefined && (!Number.isInteger(precision) || precision < 0 || precision > 8))
    fail('SVG precision must be between 0 and 8.')
  const board = options.artboardId ? doc.artboards.find((entry) => entry.id === options.artboardId) : undefined
  if (options.artboardId && !board) fail('The selected artboard does not exist.')
  const drawings = doc.drawings.filter((drawing) => !drawing.hidden)
  let minX = 0
  let minY = 0
  let width = doc.canvas.width
  let height = doc.canvas.height
  if (board) {
    minX = board.x
    minY = board.y
    width = board.width
    height = board.height
  } else if (drawings.length) {
    const bounds = drawings.map(getDrawingBounds)
    minX = Math.min(...bounds.map((bound) => bound.minX))
    minY = Math.min(...bounds.map((bound) => bound.minY))
    width = Math.max(...bounds.map((bound) => bound.maxX)) - minX
    height = Math.max(...bounds.map((bound) => bound.maxY)) - minY
  }
  const paths = drawings.map((drawing) => `  ${renderDrawingMarkup(drawing, { prefix: 'export', precision })}`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" style="isolation:isolate">`,
    `  <title>${escapeXml(doc.name)}</title>`,
    ...paths,
    '</svg>',
  ].join('\n')
}
