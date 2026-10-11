'use client'
import React, { useEffect, useState } from 'react'
import { IoCloseCircleOutline } from 'react-icons/io5'

const SplashScreen = () => {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), 1500)
    return () => clearTimeout(timeout)
  }, [])

  const handleClickCloseButton = () => {
    setIsMounted(true)
  }
  return isMounted ? null : (
    <div className="fixed z-50 w-full h-full bg-black/60 font-montserrat flex items-center justify-center">
      <button
        type="button"
        onClick={handleClickCloseButton}
        className="fixed z-50 right-0 top-0 text-white  font-bold p-3"
      >
        <IoCloseCircleOutline size={40} />
      </button>
      <svg viewBox="0 0 400 100">
        <symbol id="s-text">
          <text textAnchor="middle" x="50%" y="50%" fontSize={30} fontWeight={900}>
            Nijoow Drawing
          </text>
        </symbol>
        <g>
          <use xlinkHref="#s-text" className="text-copy" />
          <use xlinkHref="#s-text" className="text-copy" />
          <use xlinkHref="#s-text" className="text-copy" />
          <use xlinkHref="#s-text" className="text-copy" />
          <use xlinkHref="#s-text" className="text-copy" />
          <use xlinkHref="#s-text" className="text-copy" />
          <use xlinkHref="#s-text" className="text-copy" />
        </g>
      </svg>
    </div>
  )
}

export default SplashScreen
