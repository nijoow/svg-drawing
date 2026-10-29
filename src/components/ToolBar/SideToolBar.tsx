'use client'

import { useEffect, useRef, useState } from 'react'
import { RiCursorFill, RiPencilFill, RiPenNibFill, RiText, RiImageAddLine } from 'react-icons/ri'
import { IoShapes, IoSquare, IoTriangle, IoEllipse, IoNavigate, IoHandLeftOutline } from 'react-icons/io5'
import { useRecoilState } from 'recoil'
import { modeAtom } from '@/recoil/atoms'
import { SubToolBar } from '@/types/type'
import { isTextInput } from '@/editor/keyboard'

export default function SideToolBar({ onImportImage }: { onImportImage: () => void }) {
  const [mode, setMode] = useRecoilState(modeAtom)
  const [openSubToolBar, setOpenSubToolBar] = useState<SubToolBar>({
    type: null,
  })
  const toolBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (toolBarRef.current && !toolBarRef.current.contains(event.target as Node)) {
        setOpenSubToolBar({ type: null })
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTextInput(event.target)
      )
        return
      if (event.key === 'Escape') setOpenSubToolBar({ type: null })
      switch (event.key) {
        case 'v':
        case 'ㅍ':
          setMode({ type: 'SELECT', subType: 'SHAPE' })
          break
        case 'a':
        case 'ㅁ':
          setMode({ type: 'SELECT', subType: 'VERTEX' })
          break
        case 'n':
        case 'ㅜ':
          setMode({ type: 'PENCIL', subType: null })
          break
        case 'p':
        case 'ㅔ':
          setMode({ type: 'VERTEX', subType: null })
          break
        case 't':
        case 'ㅅ':
          setMode({ type: 'TEXT', subType: null })
          break
        case 'h':
        case 'ㅗ':
          setMode({ type: 'HAND', subType: null })
          break
        default:
          break
      }
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [setMode])

  return (
    <div
      ref={toolBarRef}
      className="fixed z-10 flex flex-col items-center justify-center w-16 gap-2 py-2 overflow-visible text-white -translate-y-1/2 bg-gray-600 rounded-lg left-4 top-1/2 min-h-fit"
      role="toolbar"
      aria-label="Drawing tools"
    >
      <button
        type="button"
        title="Rectangle"
        aria-label="Draw rectangle"
        aria-pressed={mode.type === 'SHAPE' && mode.subType === 'RECTANGLE'}
        className="flex w-full items-center justify-center py-2 hover:text-sky-300"
        onClick={() => {
          setMode({ type: 'SHAPE', subType: 'RECTANGLE' })
          setOpenSubToolBar({ type: null })
        }}
      >
        <IoSquare size={20} />
      </button>
      <button
        type="button"
        title="Select (V)"
        aria-label="Select"
        aria-pressed={mode.type === 'SELECT' && mode.subType === 'SHAPE'}
        className={`py-2 w-full hover:text-[#4ea1d3] flex items-center justify-center ${
          mode.type === 'SELECT' && mode.subType === 'SHAPE' ? 'text-[#4ea1d3]' : ''
        }`}
        onClick={() => {
          setMode({ type: 'SELECT', subType: 'SHAPE' })
          setOpenSubToolBar({ type: null })
        }}
      >
        <RiCursorFill size={20} />
      </button>
      <button
        type="button"
        title="Edit points (A)"
        aria-label="Edit points"
        aria-pressed={mode.type === 'SELECT' && mode.subType === 'VERTEX'}
        className={`py-2 w-full hover:text-[#4ea1d3] flex items-center justify-center ${
          mode.type === 'SELECT' && mode.subType === 'VERTEX' ? 'text-[#4ea1d3]' : ''
        }`}
        onClick={() => {
          setMode({ type: 'SELECT', subType: 'VERTEX' })
          setOpenSubToolBar({ type: null })
        }}
      >
        <IoNavigate size={20} />
      </button>
      <button
        type="button"
        title="Pencil (N)"
        aria-label="Pencil"
        aria-pressed={mode.type === 'PENCIL'}
        className={`py-2 w-full hover:text-[#4ea1d3] flex items-center justify-center ${
          mode.type === 'PENCIL' ? 'text-[#4ea1d3]' : ''
        }`}
        onClick={() => {
          setMode({ type: 'PENCIL', subType: null })
          setOpenSubToolBar({ type: null })
        }}
      >
        <RiPencilFill size={20} />
      </button>
      <button
        type="button"
        title="Pen (P)"
        aria-label="Pen"
        aria-pressed={mode.type === 'VERTEX'}
        className={`py-2 w-full hover:text-[#4ea1d3] flex items-center justify-center ${
          mode.type === 'VERTEX' ? 'text-[#4ea1d3]' : ''
        }`}
        onClick={() => {
          setMode({ type: 'VERTEX', subType: null })
          setOpenSubToolBar({ type: null })
        }}
      >
        <RiPenNibFill size={20} />
      </button>
      <div className="relative flex items-center justify-center w-full ">
        <button
          type="button"
          title="Shapes"
          aria-label="Shapes"
          aria-pressed={mode.type === 'SHAPE'}
          aria-expanded={openSubToolBar.type === 'SHAPE'}
          className={`py-2 w-full hover:text-[#4ea1d3] flex items-center justify-center ${
            mode.type === 'SHAPE' ? 'text-[#4ea1d3]' : ''
          }`}
          onClick={() => setOpenSubToolBar({ type: openSubToolBar.type === 'SHAPE' ? null : 'SHAPE' })}
        >
          <IoShapes size={20} />
        </button>
        {openSubToolBar.type === 'SHAPE' && (
          <div className="absolute top-0 flex flex-col bg-gray-600 rounded-b-lg rounded-r-lg left-full ">
            <button
              type="button"
              title="Rectangle"
              aria-label="Rectangle"
              aria-pressed={mode.type === 'SHAPE' && mode.subType === 'RECTANGLE'}
              className="p-3 hover:text-gray-400"
              onClick={() => {
                setMode({ type: 'SHAPE', subType: 'RECTANGLE' })
                setOpenSubToolBar({ type: null })
              }}
            >
              <IoSquare size={20} />
            </button>
            <button
              type="button"
              title="Ellipse"
              aria-label="Ellipse"
              aria-pressed={mode.type === 'SHAPE' && mode.subType === 'ELLIPSE'}
              className="p-3 hover:text-gray-400"
              onClick={() => {
                setMode({ type: 'SHAPE', subType: 'ELLIPSE' })
                setOpenSubToolBar({ type: null })
              }}
            >
              <IoEllipse size={20} />
            </button>
            <button
              type="button"
              title="Triangle"
              aria-label="Triangle"
              aria-pressed={mode.type === 'SHAPE' && mode.subType === 'TRIANGLE'}
              className="p-3 hover:text-gray-400"
              onClick={() => {
                setMode({ type: 'SHAPE', subType: 'TRIANGLE' })
                setOpenSubToolBar({ type: null })
              }}
            >
              <IoTriangle size={20} />
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Text"
        title="Text (T)"
        aria-pressed={mode.type === 'TEXT'}
        className={`flex w-full items-center justify-center py-2 hover:text-sky-300 ${
          mode.type === 'TEXT' ? 'text-sky-300' : ''
        }`}
        onClick={() => setMode({ type: 'TEXT', subType: null })}
      >
        <RiText size={20} />
      </button>
      <button
        type="button"
        aria-label="Import image"
        title="Import PNG, JPEG or WebP"
        className="flex w-full items-center justify-center py-2 hover:text-sky-300"
        onClick={onImportImage}
      >
        <RiImageAddLine size={20} />
      </button>
      <button
        type="button"
        aria-label="Hand"
        title="Pan (H / hold Space)"
        aria-pressed={mode.type === 'HAND'}
        className={`flex w-full items-center justify-center py-2 hover:text-sky-300 ${
          mode.type === 'HAND' ? 'text-sky-300' : ''
        }`}
        onClick={() => setMode({ type: 'HAND', subType: null })}
      >
        <IoHandLeftOutline size={20} />
      </button>
    </div>
  )
}
