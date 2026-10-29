'use client'

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { IoArrowRedo, IoArrowUndo, IoChevronDown, IoDownloadOutline } from 'react-icons/io5'
import { useRecoilState, useRecoilValue } from 'recoil'
import {
  createDocument,
  exportDocumentSvg,
  MAX_DOCUMENT_BYTES,
  parseDocument,
  serializeDocument,
} from '@/editor/document'
import { useEditorActions } from '@/editor/useEditorActions'
import { useEditorPersistence } from '@/hooks/useEditorPersistence'
import { documentState, editorErrorState, historyState } from '@/recoil/atoms'
import { appendImportedSvg, importSvgFile } from '@/vector/importSvg'
import { exportPng, exportReactComponent } from '@/vector/export'
import { isTextInput } from '@/editor/keyboard'

const buttonClass =
  'flex items-center justify-center rounded-md p-2 hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

function download(text: string, name: string, type: string) {
  downloadBlob(new Blob([text], { type }), name)
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim()
      .slice(0, 100) || 'Untitled'
  )
}

export default function DocumentToolBar() {
  const document = useRecoilValue(documentState)
  const history = useRecoilValue(historyState)
  const [editorError, setEditorError] = useRecoilState(editorErrorState)
  const { undo, redo, replaceDocument, renameDocument, updateDocument } = useEditorActions()
  const persistence = useEditorPersistence()
  const [name, setName] = useState(document.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportArtboard, setExportArtboard] = useState('')
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(1)
  const [pngBackground, setPngBackground] = useState<'transparent' | 'white'>('transparent')
  const toolbarRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const svgInput = useRef<HTMLInputElement>(null)
  const fileButton = useRef<HTMLButtonElement>(null)
  const cancelRename = useRef(false)
  const currentDocument = useRef(document)
  const currentTransaction = useRef(history.inTransaction)
  currentDocument.current = document
  currentTransaction.current = history.inTransaction
  const busy = !persistence.ready || history.inTransaction || opening || exporting

  useEffect(() => setName(document.name), [document.name])
  useEffect(() => {
    if (exportArtboard && !document.artboards.some((board) => board.id === exportArtboard)) setExportArtboard('')
  }, [document.artboards, exportArtboard])

  const saveProject = useCallback(() => {
    try {
      const namedDocument = { ...document, name: name.trim() || 'Untitled' }
      if (namedDocument.name !== document.name) renameDocument(namedDocument.name)
      download(
        serializeDocument(namedDocument),
        `${safeFilename(namedDocument.name)}.svg-drawing.json`,
        'application/json',
      )
      setFileError(null)
      setMenuOpen(false)
    } catch {
      setFileError('The project could not be saved. Please try again.')
    }
  }, [document, name, renameDocument])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        if (!busy) saveProject()
        return
      }
      if (isTextInput(event.target)) return
      if (key === 'z' || key === 'y') {
        event.preventDefault()
        if (busy) return
        if (key === 'y' || event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, redo, saveProject, undo])

  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      fileButton.current?.focus()
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const confirmReplacement = () => {
    const current = currentDocument.current
    return (
      (current.drawings.length === 0 && current.name === 'Untitled') ||
      window.confirm('Replace the current document? Save a project file first if you want to keep it.')
    )
  }

  const openProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // Opening the same file again should still work.
    if (!file) return
    setMenuOpen(false)
    setOpening(true)
    try {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Project files must be smaller than 10 MB.')
      const next = parseDocument(await file.text())
      if (currentTransaction.current) throw new Error('Finish the current edit before opening a project.')
      if (!confirmReplacement()) return
      replaceDocument(next)
      setFileError(null)
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'This project file could not be opened.')
    } finally {
      setOpening(false)
    }
  }

  const openSvg = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMenuOpen(false)
    setOpening(true)
    try {
      const drawings = await importSvgFile(file)
      if (currentTransaction.current) throw new Error('Finish the current edit before importing an SVG.')
      updateDocument(
        (current) => appendImportedSvg(current, drawings),
        drawings.map((drawing) => drawing.id),
      )
      setFileError(null)
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'This SVG could not be imported.')
    } finally {
      setOpening(false)
    }
  }

  const exportFile = async (format: 'svg' | 'png' | 'react') => {
    setExporting(true)
    try {
      const svg = exportDocumentSvg(document, { artboardId: exportArtboard || undefined, precision: 3 })
      const board = document.artboards.find((entry) => entry.id === exportArtboard)
      const filename = safeFilename(`${document.name}${board ? `-${board.name}` : ''}`)
      if (format === 'png')
        downloadBlob(
          await exportPng(svg, { scale: pngScale, background: pngBackground }),
          `${filename}@${pngScale}x.png`,
        )
      else if (format === 'react')
        download(exportReactComponent(svg, document.name), `${filename}.tsx`, 'text/plain;charset=utf-8')
      else download(svg, `${filename}.svg`, 'image/svg+xml')
      setFileError(null)
      setMenuOpen(false)
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'The document could not be exported.')
    } finally {
      setExporting(false)
    }
  }

  const commitName = () => {
    if (cancelRename.current) {
      cancelRename.current = false
      return
    }
    const next = name.trim() || 'Untitled'
    setName(next)
    if (next !== document.name) renameDocument(next)
  }

  const statusText = {
    loading: 'Restoring…',
    saving: 'Saving…',
    saved: 'Saved in this browser',
    error: 'Autosave unavailable',
    blocked: 'Recovery needs attention',
  }[persistence.status]

  return (
    <div
      ref={toolbarRef}
      className="fixed left-4 right-4 top-4 z-30 flex min-h-[52px] items-center gap-1 rounded-lg bg-gray-600 p-2 text-sm text-white shadow-sm sm:right-auto sm:gap-2"
      aria-label="Document controls"
    >
      <span className="hidden pl-1 font-semibold tracking-tight text-sky-300 sm:block">svg drawing</span>
      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
        <input
          value={name}
          maxLength={120}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              cancelRename.current = true
              setName(document.name)
              event.currentTarget.blur()
            }
          }}
          aria-label="Document name"
          title="Rename document"
          className="w-full min-w-0 rounded bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-gray-500 focus:bg-gray-700 focus:ring-1 focus:ring-sky-300"
        />
        <p className="truncate px-1 text-[10px] leading-3 text-gray-200" role="status" title={statusText}>
          {opening ? 'Opening…' : exporting ? 'Exporting…' : statusText}
        </p>
      </div>
      <div className="mx-1 h-6 w-px bg-gray-500" />
      <button
        type="button"
        className={buttonClass}
        onClick={undo}
        disabled={busy || !history.canUndo}
        aria-label="Undo"
        title="Undo (Ctrl/⌘ Z)"
      >
        <IoArrowUndo size={18} />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={redo}
        disabled={busy || !history.canRedo}
        aria-label="Redo"
        title="Redo (Ctrl/⌘ Shift Z)"
      >
        <IoArrowRedo size={18} />
      </button>
      <div className="relative">
        <button
          ref={fileButton}
          type="button"
          className={`${buttonClass} gap-1`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="document-file-actions"
          title="Document files"
        >
          File <IoChevronDown size={14} />
        </button>
        {menuOpen && (
          <div
            id="document-file-actions"
            className="absolute right-0 top-full z-20 mt-3 flex w-56 flex-col gap-1 rounded-lg bg-gray-600 p-2 shadow-lg"
            aria-label="File actions"
          >
            <button
              type="button"
              className={`${buttonClass} !justify-start`}
              disabled={busy}
              onClick={() => {
                if (!confirmReplacement()) return
                replaceDocument(createDocument())
                setMenuOpen(false)
                setFileError(null)
              }}
            >
              New document
            </button>
            <button
              type="button"
              className={`${buttonClass} !justify-start`}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Open project…
            </button>
            <button
              type="button"
              className={`${buttonClass} !justify-start`}
              disabled={busy}
              onClick={() => svgInput.current?.click()}
            >
              Import SVG…
            </button>
            <button
              type="button"
              className={`${buttonClass} !justify-start gap-2`}
              disabled={busy}
              onClick={saveProject}
            >
              <IoDownloadOutline /> Save project <span className="ml-auto text-xs text-gray-300">⌘/Ctrl S</span>
            </button>
            <div className="my-1 h-px bg-gray-500" />
            {document.artboards.length > 0 && (
              <label className="flex flex-col gap-1 px-2 py-1 text-xs text-gray-200">
                Export area
                <select
                  aria-label="Export area"
                  value={exportArtboard}
                  disabled={busy}
                  onChange={(event) => setExportArtboard(event.target.value)}
                  className="rounded bg-gray-700 p-1.5 text-white"
                >
                  <option value="">All artwork</option>
                  {document.artboards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className={`${buttonClass} !justify-start`}
              disabled={busy}
              onClick={() => exportFile('svg')}
            >
              Export SVG
            </button>
            <button
              type="button"
              className={`${buttonClass} !justify-start`}
              disabled={busy}
              onClick={() => exportFile('react')}
            >
              Export React component
            </button>
            <div className="flex gap-2 px-2">
              <select
                aria-label="PNG scale"
                value={pngScale}
                disabled={busy}
                onChange={(event) => setPngScale(Number(event.target.value) as 1 | 2 | 3)}
                className="w-16 rounded bg-gray-700 p-1 text-xs"
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={3}>3×</option>
              </select>
              <select
                aria-label="PNG background"
                value={pngBackground}
                disabled={busy}
                onChange={(event) => setPngBackground(event.target.value as 'transparent' | 'white')}
                className="min-w-0 flex-1 rounded bg-gray-700 p-1 text-xs"
              >
                <option value="transparent">Transparent</option>
                <option value="white">White</option>
              </select>
            </div>
            <button
              type="button"
              className={`${buttonClass} !justify-start`}
              disabled={busy}
              onClick={() => exportFile('png')}
            >
              Export PNG
            </button>
            <p className="px-2 py-1 text-xs leading-4 text-gray-200">
              Project files preserve every edit. Export artwork as SVG, PNG, or a React component.
            </p>
          </div>
        )}
      </div>
      <input
        ref={svgInput}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        aria-label="Import SVG file"
        onChange={openSvg}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Open project file"
        onChange={openProject}
      />
      {(fileError || editorError || persistence.error) && (
        <div
          className="absolute left-0 right-0 top-full z-10 mt-[68px] rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 shadow-sm sm:min-w-[420px]"
          role="alert"
        >
          <p>{fileError || editorError || persistence.error}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {fileError || editorError ? (
              <button
                type="button"
                className="underline"
                onClick={() => (fileError ? setFileError(null) : setEditorError(null))}
              >
                Dismiss
              </button>
            ) : persistence.status === 'blocked' ? (
              <>
                {persistence.recovery !== null && (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => download(persistence.recovery!, 'browser-recovery.json', 'application/json')}
                  >
                    Download recovery copy
                  </button>
                )}
                <button
                  type="button"
                  className="underline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Replace the browser recovery copy with this document? Download the old recovery copy first if you want to keep it.',
                      )
                    )
                      persistence.discardRecovery()
                  }}
                >
                  Use current document for autosave
                </button>
              </>
            ) : (
              <button type="button" className="underline" onClick={persistence.retryAutosave}>
                Retry autosave
              </button>
            )}
            <button type="button" className="underline" disabled={busy} onClick={saveProject}>
              Save project file
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
