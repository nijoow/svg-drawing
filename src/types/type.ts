export type ModeType = 'SELECT' | 'PENCIL' | 'VERTEX' | 'SHAPE' | 'TEXT'
type ModeSubType = 'INSERT' | 'SHAPE' | 'VERTEX' | 'RECTANGLE' | 'ELLIPSE' | 'TRIANGLE'
type Option = 'FILL' | 'STROKE' | 'STORKE_WIDTH' | 'OPACITY' | null
export type DrawingType = 'POLYGON' | 'PATH' | 'ELLIPSE' | 'SPLINE' | 'TEXT'

export type Direction = 'TL' | 'T' | 'TR' | 'L' | 'R' | 'BL' | 'B' | 'BR' | null

export interface Mode {
  type: ModeType | null
  subType: ModeSubType | null
}

export interface Options {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface SubToolBar {
  type: ModeType | null
}

export interface OptionsToolBar {
  type: Option
}

export interface Point {
  startX: number | undefined
  startY: number | undefined
  endX: number | undefined
  endY: number | undefined
}

interface Center {
  x: number
  y: number
}

export interface Vertex {
  x: number
  y: number
  type: 'M' | 'L' | 'C' | 'S' | null
  nextHandlerX?: number
  nextHandlerY?: number
  currentHandlerX?: number
  currentHandlerY?: number
  id: string
}

export interface Drawing {
  id: string
  type: DrawingType
  subType: null
  vertexs: Vertex[]
  width: number
  height: number
  center: Center
  rotate: number
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}
