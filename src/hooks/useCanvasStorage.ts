import { useEffect, useState } from 'react'
import { useStore } from 'jotai'
import { savedDrawingsAtom } from '@/state/drawing'
import { loadCanvas, saveCanvas } from '@/state/canvasStorage'

export default function useCanvasStorage() {
  const store = useStore()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    function restore() {
      try {
        const saved = loadCanvas(window.localStorage)
        if (saved) store.set(savedDrawingsAtom, saved)
      } catch {
        setNotice('저장한 그림을 불러오지 못했습니다. 현재 캔버스에서 계속 그릴 수 있습니다.')
      }
    }
    restore()
    return store.sub(savedDrawingsAtom, () => {
      try {
        saveCanvas(window.localStorage, store.get(savedDrawingsAtom))
        setNotice('')
      } catch {
        setNotice('이 브라우저에 그림을 저장할 수 없습니다. 현재 캔버스에서 계속 그릴 수 있습니다.')
      }
    })
  }, [store])
  return notice
}
