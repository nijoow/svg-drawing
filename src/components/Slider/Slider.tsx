import { useEffect, useRef } from 'react'

const adjustmentKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']

const Slider = ({
  value,
  setValue,
  option,
  label,
  onEditStart,
  onEditEnd,
}: {
  value: number
  setValue: (value: number) => void
  option?: { min: number; max: number; step: number }
  label: string
  onEditStart?: () => void
  onEditEnd?: () => void
}) => {
  const editing = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const editEnd = useRef(onEditEnd)
  editEnd.current = onEditEnd
  const begin = () => {
    if (editing.current) return
    editing.current = true
    onEditStart?.()
  }
  const end = () => {
    if (!editing.current) return
    editing.current = false
    editEnd.current?.()
  }
  useEffect(() => {
    const finish = () => {
      if (!editing.current) return
      editing.current = false
      editEnd.current?.()
    }
    const finishOutside = (event: PointerEvent) => {
      if (event.target !== input.current) finish()
    }
    window.addEventListener('pointerdown', finishOutside, true)
    window.addEventListener('blur', finish)
    return () => {
      window.removeEventListener('pointerdown', finishOutside, true)
      window.removeEventListener('blur', finish)
      finish()
    }
  }, [])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(Number(event.target.value))
  }

  return (
    <div className="flex items-center">
      <input
        ref={input}
        type="range"
        value={value}
        aria-label={label}
        onChange={handleChange}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          begin()
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(event) => {
          if (adjustmentKeys.includes(event.key)) begin()
        }}
        onKeyUp={(event) => {
          if (adjustmentKeys.includes(event.key)) end()
        }}
        onBlur={end}
        className="w-24 bg-red-50 fill-slate-600"
        {...option}
      />
    </div>
  )
}

export default Slider
