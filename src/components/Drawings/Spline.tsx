import { Drawing } from '@/types/type'
import { bezierCommand } from '@/utils/getInformationFromSplinePaths'
import React from 'react'

const Spline = ({ drawing }: { drawing: Drawing }) => {
  const left = drawing.center.x - drawing.width / 2
  const top = drawing.center.y - drawing.height / 2

  const d = drawing.vertexs.reduce(
    (acc, point, i, a) => (i === 0 ? `M ${point.x},${point.y}` : `${acc} ${bezierCommand(point, i, a)}`),
    '',
  )
  return (
    <svg
      id={drawing.id}
      viewBox={`${left} ${top} ${drawing.width} ${drawing.height}`}
      width={drawing.width}
      height={drawing.height}
      overflow={'visible'}
      className={`absolute`}
      style={{
        left,
        top,
      }}
    >
      <path
        id={drawing.id}
        d={d}
        fill="none"
        stroke={drawing.stroke}
        strokeWidth={drawing.strokeWidth}
        opacity={drawing.opacity}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default Spline
