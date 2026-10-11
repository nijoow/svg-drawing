import { useRecoilValue } from 'recoil'
import { snapGuidesAtom } from '@/recoil/vertexSelection'
import { viewportAtom } from '@/recoil/atoms'

export default function SnapGuides() {
  const guides = useRecoilValue(snapGuidesAtom)
  const viewport = useRecoilValue(viewportAtom)
  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden="true">
      {guides.map((guide) => (
        <line
          key={`${guide.axis}-${guide.value}`}
          x1={guide.axis === 'x' ? guide.value : -100000}
          x2={guide.axis === 'x' ? guide.value : 100000}
          y1={guide.axis === 'y' ? guide.value : -100000}
          y2={guide.axis === 'y' ? guide.value : 100000}
          stroke="#ec4899"
          strokeWidth={1 / viewport.zoom}
          strokeDasharray={`${4 / viewport.zoom} ${4 / viewport.zoom}`}
        />
      ))}
    </svg>
  )
}
