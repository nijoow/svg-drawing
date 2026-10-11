'use client'

import { useEffect, useRef, useState } from 'react'
import { IoStop } from 'react-icons/io5'
import { useRecoilState, useRecoilValue } from 'recoil'
import { basicOptionsAtom, currentOptionsState, recentColorsAtom, selectedDrawingsState } from '@/recoil/atoms'
import { OptionsToolBar } from '@/types/type'
import { ChromePicker, ColorResult } from 'react-color'
import Slider from '@/components/Slider/Slider'
import VerticalDivider from '../common/VerticalDivider'
import { useEditorActions } from '@/editor/useEditorActions'

const ColorSubToolBar = ({ type }: { type: 'fill' | 'stroke' }) => {
  // recoil
  const selectedDrawings = useRecoilValue(selectedDrawingsState)
  const currentOptions = useRecoilValue(currentOptionsState)
  const [, setBasicOptions] = useRecoilState(basicOptionsAtom)
  const [recentColors, setRecentColors] = useRecoilState(recentColorsAtom)
  const { beginTransaction, endTransaction, patchSelection } = useEditorActions()
  const changingColor = useRef(false)
  const pointerDown = useRef(false)
  const colorToolbar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const finish = () => {
      pointerDown.current = false
      if (changingColor.current) {
        changingColor.current = false
        endTransaction()
      }
    }
    // End a pending text color edit before a canvas pointer handler starts its
    // own transaction. The picker's delayed completion must not end that drag.
    const finishOutside = (event: PointerEvent) => {
      if (!colorToolbar.current?.contains(event.target as Node)) finish()
    }
    window.addEventListener('pointerdown', finishOutside, true)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
    return () => {
      window.removeEventListener('pointerdown', finishOutside, true)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      finish()
    }
  }, [endTransaction])

  // function
  const handleClickTransparentColor = () => setColor('transparent')

  const handleClickRecentColor = (color: string) => setColor(color)

  const onChangeColorPicker = (color: ColorResult) => {
    if (selectedDrawings.length && !changingColor.current) {
      changingColor.current = true
      beginTransaction()
    }
    setColor(color.hex)
  }

  const setColor = (color: string) => {
    if (selectedDrawings.length)
      patchSelection(type === 'fill' ? { fill: color, gradient: undefined } : { stroke: color })
    else setBasicOptions({ ...currentOptions, [type]: color })
  }

  const onChangeCompleteColorPicker = (color: ColorResult) => {
    if (changingColor.current && !pointerDown.current) {
      changingColor.current = false
      endTransaction()
    }
    setRecentColors((recentColors) =>
      (recentColors.includes(color.hex)
        ? [color.hex, ...recentColors.filter((recentColor) => recentColor !== color.hex)]
        : [color.hex, ...recentColors]
      ).slice(0, 7),
    )
  }

  return (
    <div ref={colorToolbar} className="absolute flex-col left-0 gap-2 flex p-3 bg-gray-600 rounded-lg top-full">
      <div className="w-full h-5 flex gap-[9px]">
        <button
          type="button"
          aria-label={`Transparent ${type}`}
          title={`Transparent ${type}`}
          className="w-5 h-5 cursor-pointer bg-white rounded-sm flex items-center justify-center"
          onClick={handleClickTransparentColor}
        >
          <div className="bg-red-500 h-0.5 w-full rotate-45" />
        </button>

        {recentColors.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={`${type} ${color}`}
            title={color}
            className="w-5 h-5 cursor-pointer rounded-sm"
            style={{ backgroundColor: color }}
            onClick={() => handleClickRecentColor(color)}
          />
        ))}
      </div>
      <div
        onPointerDownCapture={() => {
          pointerDown.current = true
        }}
      >
        <ChromePicker
          disableAlpha
          color={currentOptions[type]}
          onChange={onChangeColorPicker}
          onChangeComplete={onChangeCompleteColorPicker}
        />
      </div>
    </div>
  )
}
export default function TopToolBar() {
  // recoil
  const selectedDrawings = useRecoilValue(selectedDrawingsState)
  const currentOptions = useRecoilValue(currentOptionsState)
  const [, setBasicOptions] = useRecoilState(basicOptionsAtom)
  const [openSubToolBar, setOpenSubToolBar] = useState<OptionsToolBar>({
    type: null,
  })
  const { beginTransaction, endTransaction, patchSelection } = useEditorActions()
  const editingStyle = useRef(false)
  const beginStyleEdit = () => {
    if (selectedDrawings.length && !editingStyle.current) {
      editingStyle.current = true
      beginTransaction()
    }
  }
  const endStyleEdit = () => {
    if (editingStyle.current) {
      editingStyle.current = false
      endTransaction()
    }
  }

  // useRef
  const toolBarRef = useRef<HTMLDivElement>(null)

  // useEffect
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (toolBarRef.current && !toolBarRef.current.contains(event.target as Node)) {
        setOpenSubToolBar({ type: null })
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (event.key === 'Escape') setOpenSubToolBar({ type: null })
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const setStrokeWidthValue = (value: number) => {
    if (selectedDrawings.length) patchSelection({ strokeWidth: value })
    else setBasicOptions({ ...currentOptions, strokeWidth: value })
  }

  const setOpacityValue = (value: number) => {
    if (selectedDrawings.length) patchSelection({ opacity: Math.round(value) / 100 })
    else
      setBasicOptions({
        ...currentOptions,
        opacity: Math.round(value) / 100,
      })
  }

  return (
    <div
      ref={toolBarRef}
      className="fixed z-20 flex items-center overflow-visible text-white bg-gray-600 rounded-lg left-4 top-[84px] min-h-fit gap-0.5 text-xs sm:text-sm"
      role="toolbar"
      aria-label="Drawing style"
    >
      <div className="relative flex items-center justify-center p-2.5 sm:p-3 w-fit">
        <button
          type="button"
          aria-label="Fill color"
          title="Fill color"
          aria-expanded={openSubToolBar.type === 'FILL'}
          className="flex items-center justify-center w-5 h-5 bg-white rounded-sm"
          onClick={() => setOpenSubToolBar({ type: openSubToolBar.type === 'FILL' ? null : 'FILL' })}
        >
          {currentOptions.fill === 'transparent' ? (
            <div className="bg-red-500 h-0.5 w-full rotate-45" />
          ) : (
            <IoStop size={20} fill={currentOptions.fill} />
          )}
        </button>
        {openSubToolBar.type === 'FILL' && <ColorSubToolBar type="fill" />}
      </div>
      <VerticalDivider />
      <div className="relative flex items-center justify-center p-2.5 sm:p-3 w-fit">
        <button
          type="button"
          aria-label="Stroke color"
          title="Stroke color"
          aria-expanded={openSubToolBar.type === 'STROKE'}
          className="flex items-center justify-center w-5 h-5 bg-white rounded-sm"
          onClick={() => setOpenSubToolBar({ type: openSubToolBar.type === 'STROKE' ? null : 'STROKE' })}
        >
          <div
            className="flex items-center justify-center w-[14.2px] h-[14.2px] rounded-sm"
            style={{
              backgroundColor: currentOptions.stroke === 'transparent' ? 'rgb(75, 85, 99)' : currentOptions.stroke,
            }}
          >
            {currentOptions.stroke === 'transparent' && <div className="bg-red-500 h-0.5 w-4 rotate-45 absolute" />}
            <IoStop size={10} className="fill-white" />
          </div>
        </button>
        {openSubToolBar.type === 'STROKE' && <ColorSubToolBar type="stroke" />}
      </div>
      <VerticalDivider />
      <div className="relative flex items-center justify-center p-2.5 sm:p-3">
        <button
          type="button"
          title="Stroke width"
          aria-expanded={openSubToolBar.type === 'STORKE_WIDTH'}
          className="flex items-center space-x-2 min-w-fit"
          onClick={() => setOpenSubToolBar({ type: openSubToolBar.type === 'STORKE_WIDTH' ? null : 'STORKE_WIDTH' })}
        >
          <span>Stroke</span>
          <span className="min-w-fit">{currentOptions.strokeWidth} px</span>
        </button>
        {openSubToolBar.type === 'STORKE_WIDTH' && (
          <div className="absolute left-0 flex p-3 py-3 bg-gray-600 rounded-lg top-full">
            <Slider
              value={currentOptions.strokeWidth}
              label="Stroke width"
              setValue={setStrokeWidthValue}
              onEditStart={beginStyleEdit}
              onEditEnd={endStyleEdit}
              option={{ min: 0, max: 50, step: 1 }}
            />
          </div>
        )}
      </div>
      <VerticalDivider />
      <div className="relative flex items-center justify-center p-2.5 sm:p-3">
        <button
          type="button"
          title="Opacity"
          aria-expanded={openSubToolBar.type === 'OPACITY'}
          className="flex items-center space-x-2 min-w-fit"
          onClick={() => setOpenSubToolBar({ type: openSubToolBar.type === 'OPACITY' ? null : 'OPACITY' })}
        >
          <span>Opacity</span>
          <span className="min-w-fit">{Math.round(currentOptions.opacity * 100)} %</span>
        </button>
        {openSubToolBar.type === 'OPACITY' && (
          <div className="absolute right-0 flex p-3 bg-gray-600 rounded-lg top-full">
            <Slider
              value={currentOptions.opacity * 100}
              label="Opacity"
              setValue={setOpacityValue}
              onEditStart={beginStyleEdit}
              onEditEnd={endStyleEdit}
              option={{ min: 0, max: 100, step: 1 }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
