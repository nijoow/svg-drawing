'use client'

import { useEffect, useRef, useState } from 'react'
import { FiCircle, FiEdit2, FiMousePointer, FiPenTool, FiSquare, FiTriangle } from 'react-icons/fi'
import { IoShapesOutline } from 'react-icons/io5'
import { TbVectorBezier } from 'react-icons/tb'
import { useSetAtom } from 'jotai'
import { selectedDrawingIdAtom } from '@/state/drawing'
import type { Mode } from '@/types/type'

const tools = [
  { name: '선택', key: 'v', koreanKey: 'ㅍ', icon: FiMousePointer, mode: { type: 'SELECT', subType: 'SHAPE' } },
  { name: '점 편집', key: 'a', koreanKey: 'ㅁ', icon: TbVectorBezier, mode: { type: 'SELECT', subType: 'VERTEX' } },
  { name: '연필', key: 'n', koreanKey: 'ㅜ', icon: FiEdit2, mode: { type: 'PENCIL', subType: null } },
  { name: '펜', key: 'p', koreanKey: 'ㅔ', icon: FiPenTool, mode: { type: 'VERTEX', subType: null } },
] as const
const shapes = [
  { name: '사각형', type: 'RECTANGLE', icon: FiSquare },
  { name: '타원', type: 'ELLIPSE', icon: FiCircle },
  { name: '삼각형', type: 'TRIANGLE', icon: FiTriangle },
] as const

export default function SideToolBar({
  mode,
  changeMode,
  penPoints,
  finishPath,
}: {
  mode: Mode
  changeMode: (next: Mode) => void
  penPoints: number
  finishPath: () => void
}) {
  const setSelected = useSetAtom(selectedDrawingIdAtom)
  const [shapesOpen, setShapesOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selectedShape = shapes.find((shape) => mode.type === 'SHAPE' && mode.subType === shape.type)

  function choose(next: Mode) {
    if (next.type !== 'SELECT') setSelected(null)
    changeMode(next)
    setShapesOpen(false)
  }

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !bar.current?.contains(event.target)) setShapesOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && shapesOpen) {
        setShapesOpen(false)
        trigger.current?.focus()
        return
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable || event.target.closest('input, textarea, select')))
      )
        return
      const tool = tools.find(({ key, koreanKey }) => key === event.key.toLowerCase() || koreanKey === event.key)
      if (tool) {
        if (tool.mode.type !== 'SELECT') setSelected(null)
        setShapesOpen(false)
        changeMode(tool.mode)
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', onKey)
    }
  }, [changeMode, setSelected, shapesOpen])

  return (
    <div ref={bar} className="dock-wrap">
      {!shapesOpen && (selectedShape || mode.type === 'VERTEX') && (
        <div className="tool-hint">
          {selectedShape ? (
            <span>{selectedShape.name}을 드래그해서 그리세요</span>
          ) : (
            <>
              <span>{penPoints ? '점을 이어 그리는 중' : '캔버스에 점을 찍으세요'}</span>
              <button type="button" disabled={penPoints < 2} onClick={finishPath}>
                선 완성
              </button>
              <button type="button" onClick={() => choose(tools[0].mode)}>
                취소
              </button>
            </>
          )}
        </div>
      )}
      <div role="group" aria-label="그리기 도구" className="tool-panel tool-dock">
        {tools.map(({ name, key, icon: Icon, mode: toolMode }) => (
          <button
            key={key}
            type="button"
            className="tool-button dock-button"
            title={name + ' (' + key.toUpperCase() + ')'}
            aria-pressed={mode.type === toolMode.type && mode.subType === toolMode.subType}
            onClick={() => choose(toolMode)}
          >
            <Icon aria-hidden="true" />
            <span>{name}</span>
          </button>
        ))}
        <div className="shape-slot">
          <button
            type="button"
            ref={trigger}
            className="tool-button dock-button"
            aria-expanded={shapesOpen}
            aria-pressed={mode.type === 'SHAPE'}
            onClick={() => setShapesOpen((prev) => !prev)}
          >
            <IoShapesOutline aria-hidden="true" />
            <span>{selectedShape?.name ?? '도형'}</span>
          </button>
          {shapesOpen && (
            <div role="group" aria-label="도형 종류" className="tool-panel shape-list">
              {shapes.map(({ name, type, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  className="tool-button"
                  aria-pressed={mode.type === 'SHAPE' && mode.subType === type}
                  onClick={() => {
                    choose({ type: 'SHAPE', subType: type })
                    trigger.current?.focus()
                  }}
                >
                  <Icon aria-hidden="true" />
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
