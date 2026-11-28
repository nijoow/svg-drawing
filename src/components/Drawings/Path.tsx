import { memo } from 'react'
import type { Drawing } from '@/types/type'
import { editableVertices } from '@/utils/getInformationFromSplinePaths'
import { pathData } from '@/utils/pathGeometry'

const Path = ({ drawing }: { drawing: Drawing }) => {
  const left = drawing.center.x - drawing.width / 2
  const top = drawing.center.y - drawing.height / 2

  const width = Math.max(drawing.width, 1)
  const height = Math.max(drawing.height, 1)
  const pencil = drawing.type === 'SPLINE'

  return (
    <svg
      id={drawing.id}
      viewBox={`${left} ${top} ${width} ${height}`}
      width={width}
      height={height}
      overflow={'visible'}
      className={`absolute`}
      style={{
        left,
        top,
      }}
    >
      <path
        d={pathData(editableVertices(drawing), drawing.type === 'POLYGON')}
        fill={pencil ? 'none' : drawing.fill}
        strokeLinecap={pencil ? 'round' : undefined}
        stroke={drawing.stroke}
        strokeWidth={drawing.strokeWidth}
        opacity={drawing.opacity}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default memo(Path)
