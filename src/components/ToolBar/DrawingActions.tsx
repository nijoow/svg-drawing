import { useEffect, useRef } from 'react'
import { useAtom } from 'jotai'
import { FiChevronsDown, FiChevronDown, FiChevronUp, FiChevronsUp, FiTrash2 } from 'react-icons/fi'
import { drawingsAtom, selectedDrawingIdAtom } from '@/state/drawing'

const orders = [
  { key: 'back', name: '맨 뒤로', icon: FiChevronsDown },
  { key: 'backward', name: '한 단계 뒤로', icon: FiChevronDown },
  { key: 'forward', name: '한 단계 앞으로', icon: FiChevronUp },
  { key: 'front', name: '맨 앞으로', icon: FiChevronsUp },
] as const
type Order = (typeof orders)[number]['key']

export default function DrawingActions({ onDone }: { onDone?: () => void }) {
  const [drawings, setDrawings] = useAtom(drawingsAtom)
  const [id, setId] = useAtom(selectedDrawingIdAtom)
  const index = drawings.findIndex((item) => item.id === id)
  if (index < 0) return null

  function reorder(order: Order) {
    setDrawings((items) => {
      const from = items.findIndex((item) => item.id === id)
      if (from < 0) return items
      const last = items.length - 1
      const to = { back: 0, backward: Math.max(0, from - 1), forward: Math.min(last, from + 1), front: last }[order]
      if (to === from) return items
      const next = [...items]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    onDone?.()
  }

  return (
    <div className="object-actions">
      <h3>쌓기 순서</h3>
      <div className="order-grid">
        {orders.map(({ key, name, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className="tool-button"
            onClick={() => reorder(key)}
            disabled={key === 'back' || key === 'backward' ? index === 0 : index === drawings.length - 1}
          >
            <Icon aria-hidden="true" />
            {name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="tool-button delete-button"
        onClick={() => {
          setDrawings((items) => items.filter((item) => item.id !== id))
          setId(null)
          onDone?.()
        }}
      >
        <FiTrash2 aria-hidden="true" />
        도형 삭제
      </button>
    </div>
  )
}

export function DrawingMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    menuRef.current?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose()
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [onClose])
  return (
    <div
      ref={menuRef}
      role="group"
      aria-label="도형 작업"
      className="tool-panel context-menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      style={{
        left: `clamp(8px, ${x}px, calc(100vw - 234px))`,
        top: `clamp(8px, ${y}px, calc(100dvh - 220px))`,
      }}
    >
      <DrawingActions onDone={onClose} />
      <button type="button" className="tool-button" onClick={onClose}>
        닫기
      </button>
    </div>
  )
}
