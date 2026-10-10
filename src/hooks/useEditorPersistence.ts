'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRecoilValue } from 'recoil'
import { EditorDocument, parseDocument, serializeDocument } from '@/editor/document'
import { useEditorActions } from '@/editor/useEditorActions'
import { documentState, historyState } from '@/recoil/atoms'

export const AUTOSAVE_KEY = 'svg-drawing.document.v1'
type SaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'blocked'

/** Only completed edits reach the recovery copy; a drag is never persisted halfway. */
export function useEditorPersistence() {
  const document = useRecoilValue(documentState)
  const { inTransaction } = useRecoilValue(historyState)
  const { replaceDocument } = useEditorActions()
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<string | null>(null)
  const initialized = useRef(false)
  const blocked = useRef(false)
  const committed = useRef<EditorDocument | null>(null)
  const lastSaved = useRef<string | null>(null)
  const lastObserved = useRef<string | null>(null)

  const blockExternalChange = useCallback((stored: string | null) => {
    blocked.current = true
    setRecovery(stored)
    setStatus('blocked')
    setError(
      'Another tab changed the browser recovery copy. Your work in this tab is kept here; save a project file before choosing which copy to keep.',
    )
  }, [])

  const flush = useCallback(() => {
    if (blocked.current || !committed.current) return
    try {
      const serialized = serializeDocument(committed.current)
      const stored = window.localStorage.getItem(AUTOSAVE_KEY)
      if (stored !== lastObserved.current) {
        blockExternalChange(stored)
        return
      }
      if (serialized !== lastSaved.current) {
        window.localStorage.setItem(AUTOSAVE_KEY, serialized)
        lastSaved.current = serialized
        lastObserved.current = serialized
      }
      setError(null)
      setStatus('saved')
    } catch {
      setError('Browser storage is unavailable or full. Save a project file to keep your work.')
      setStatus('error')
    }
  }, [blockExternalChange])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(AUTOSAVE_KEY)
      lastObserved.current = stored
      if (stored !== null) {
        const restored = parseDocument(stored)
        committed.current = restored
        lastSaved.current = serializeDocument(restored)
        replaceDocument(restored)
      }
      setStatus(stored === null ? 'saving' : 'saved')
    } catch {
      // Preserve unreadable or newer recovery data until the user resolves it.
      blocked.current = true
      setRecovery(stored)
      setStatus('blocked')
      setError(
        stored === null
          ? 'Browser storage could not be read. Save a project file to keep your work.'
          : 'The browser recovery copy could not be opened. It has been kept unchanged.',
      )
    } finally {
      setReady(true)
    }
  }, [replaceDocument])

  useEffect(() => {
    if (!ready || inTransaction) return
    committed.current = document
    if (blocked.current) return
    setStatus('saving')
    const timeout = window.setTimeout(flush, 500)
    return () => window.clearTimeout(timeout)
  }, [document, flush, inTransaction, ready])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return
      if (event.key !== AUTOSAVE_KEY && event.key !== null) return
      if (event.newValue !== lastObserved.current) blockExternalChange(event.newValue)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('storage', handleStorage)
    }
  }, [blockExternalChange, flush])

  const discardRecovery = useCallback(() => {
    if (!committed.current) return
    try {
      const serialized = serializeDocument(committed.current)
      // setItem is atomic: a quota error must leave the previous recovery intact.
      window.localStorage.setItem(AUTOSAVE_KEY, serialized)
      blocked.current = false
      lastObserved.current = serialized
      lastSaved.current = serialized
      setRecovery(null)
      setError(null)
      setStatus('saved')
    } catch {
      setError('Browser storage is unavailable. Save a project file to keep your work.')
    }
  }, [])

  return { ready, status, error, recovery, retryAutosave: flush, discardRecovery }
}
