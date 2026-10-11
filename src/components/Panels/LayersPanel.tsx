'use client'

import { useState } from 'react'
import { useRecoilValue } from 'recoil'
import {
  IoChevronDown,
  IoChevronForward,
  IoEyeOffOutline,
  IoEyeOutline,
  IoLockClosedOutline,
  IoLockOpenOutline,
  IoLayersOutline,
} from 'react-icons/io5'
import { documentState, selectedDrawingIdsAtom } from '@/recoil/atoms'
import { useEditorActions } from '@/editor/useEditorActions'
import { groupDrawingIds, reorderDocumentSelection } from '@/editor/panelCommands'
import { NameField, panelButton } from './PanelFields'

export default function LayersPanel() {
  const document = useRecoilValue(documentState)
  const selectedIds = useRecoilValue(selectedDrawingIdsAtom)
  const actions = useEditorActions()
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<string | null>(null)
  const selected = new Set(selectedIds)
  const editableIds = document.drawings
    .filter((drawing) => selected.has(drawing.id) && !drawing.locked)
    .map(({ id }) => id)
  const select = (ids: string[], event: React.MouseEvent) => {
    const available = ids.filter((id) =>
      document.drawings.some((drawing) => drawing.id === id && !drawing.hidden && !drawing.locked),
    )
    if (event.shiftKey && anchor && available.length === 1) {
      const from = document.drawings.findIndex((drawing) => drawing.id === anchor)
      const to = document.drawings.findIndex((drawing) => drawing.id === available[0])
      const range = document.drawings.slice(Math.min(from, to), Math.max(from, to) + 1)
      actions.setSelection(
        Array.from(
          new Set([
            ...selectedIds,
            ...range.filter((drawing) => !drawing.locked && !drawing.hidden).map(({ id }) => id),
          ]),
        ),
      )
    } else if (event.shiftKey || event.metaKey || event.ctrlKey) {
      actions.setSelection(
        available.every((id) => selected.has(id))
          ? selectedIds.filter((id) => !available.includes(id))
          : Array.from(new Set([...selectedIds, ...available])),
      )
    } else actions.setSelection(available)
    if (available.length) setAnchor(available[0])
  }
  const toggleFlag = (ids: string[], flag: 'hidden' | 'locked') => {
    const items = document.drawings.filter((drawing) => ids.includes(drawing.id))
    const value = !items.every((drawing) => drawing[flag])
    actions.updateDocument((current) => ({
      ...current,
      drawings: current.drawings.map((drawing) => (ids.includes(drawing.id) ? { ...drawing, [flag]: value } : drawing)),
    }))
  }
  const rename = (id: string, name: string, group = false) => {
    actions.updateDocument((current) =>
      group
        ? {
            ...current,
            groups: current.groups.map((item) => (item.id === id ? { ...item, name } : item)),
          }
        : {
            ...current,
            drawings: current.drawings.map((item) => (item.id === id ? { ...item, name } : item)),
          },
    )
    setRenaming(null)
  }
  const flags = (ids: string[], name: string) => {
    const items = document.drawings.filter((drawing) => ids.includes(drawing.id))
    const hidden = items.length > 0 && items.every((drawing) => drawing.hidden)
    const locked = items.length > 0 && items.every((drawing) => drawing.locked)
    return (
      <>
        <button
          type="button"
          aria-label={`${hidden ? 'Show' : 'Hide'} ${name}`}
          title={hidden ? 'Show layer' : 'Hide layer'}
          className="rounded p-1.5 text-gray-200 hover:bg-gray-500"
          onClick={() => toggleFlag(ids, 'hidden')}
        >
          {hidden ? <IoEyeOffOutline size={14} /> : <IoEyeOutline size={14} />}
        </button>
        <button
          type="button"
          aria-label={`${locked ? 'Unlock' : 'Lock'} ${name}`}
          title={locked ? 'Unlock layer' : 'Lock layer'}
          className="rounded p-1.5 text-gray-200 hover:bg-gray-500"
          onClick={() => toggleFlag(ids, 'locked')}
        >
          {locked ? <IoLockClosedOutline size={14} /> : <IoLockOpenOutline size={14} />}
        </button>
      </>
    )
  }
  const renderLevel = (parentId?: string, depth = 0): React.ReactNode => {
    const entries = [
      ...document.groups
        .filter((group) => group.parentId === parentId)
        .map((group) => ({
          kind: 'group' as const,
          id: group.id,
          group,
          index: Math.max(
            -1,
            ...groupDrawingIds(document, group.id).map((id) =>
              document.drawings.findIndex((drawing) => drawing.id === id),
            ),
          ),
        })),
      ...document.drawings
        .map((drawing, index) => ({ kind: 'drawing' as const, id: drawing.id, drawing, index }))
        .filter(({ drawing }) => drawing.groupId === parentId),
    ].sort((a, b) => b.index - a.index)
    return entries.map((entry) => {
      if (entry.kind === 'group') {
        const ids = groupDrawingIds(document, entry.id)
        const isSelected = ids.length > 0 && ids.every((id) => selected.has(id))
        const isCollapsed = collapsed.includes(entry.id)
        return (
          <div key={entry.id}>
            <div
              className={`flex items-center gap-0.5 rounded-md py-0.5 ${
                isSelected ? 'bg-blue-500/40' : 'hover:bg-gray-500/40'
              }`}
              style={{ paddingLeft: Math.min(depth * 10, 40) }}
            >
              <button
                type="button"
                className="rounded p-1"
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${entry.group.name}`}
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsed((current) =>
                    isCollapsed ? current.filter((id) => id !== entry.id) : [...current, entry.id],
                  )
                }
              >
                {isCollapsed ? <IoChevronForward size={12} /> : <IoChevronDown size={12} />}
              </button>
              {renaming === entry.id ? (
                <NameField
                  label="Group name"
                  value={entry.group.name}
                  autoFocus
                  onFinish={() => setRenaming(null)}
                  onCommit={(name) => rename(entry.id, name, true)}
                />
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-xs"
                  aria-pressed={isSelected}
                  onClick={(event) => select(ids, event)}
                  onDoubleClick={() => setRenaming(entry.id)}
                  title="Double-click to rename group"
                >
                  <IoLayersOutline className="flex-none" size={14} />
                  <span className="truncate">{entry.group.name}</span>
                </button>
              )}
              {flags(ids, entry.group.name)}
            </div>
            {!isCollapsed && renderLevel(entry.id, depth + 1)}
          </div>
        )
      }
      const { drawing } = entry
      const name = drawing.name || `${drawing.type.charAt(0)}${drawing.type.slice(1).toLowerCase()}`
      return (
        <div
          key={entry.id}
          className={`flex items-center gap-1 rounded-md py-0.5 ${
            selected.has(entry.id) ? 'bg-blue-500/40' : 'hover:bg-gray-500/40'
          }`}
          style={{ paddingLeft: 7 + Math.min(depth * 10, 40) }}
        >
          <span
            aria-hidden="true"
            className="h-3 w-3 flex-none rounded-sm border border-white/30"
            style={{
              background: drawing.gradient
                ? `linear-gradient(90deg, ${drawing.gradient.stops.map(({ color }) => color).join(',')})`
                : drawing.fill === 'none' || drawing.fill === 'transparent'
                ? drawing.stroke
                : drawing.fill,
            }}
          />
          {renaming === entry.id ? (
            <NameField
              label="Layer name"
              value={name}
              autoFocus
              onFinish={() => setRenaming(null)}
              onCommit={(value) => rename(entry.id, value)}
            />
          ) : (
            <button
              type="button"
              className={`min-w-0 flex-1 truncate py-1.5 text-left text-xs ${drawing.hidden ? 'opacity-50' : ''}`}
              aria-label={`Select ${name}`}
              aria-pressed={selected.has(entry.id)}
              onClick={(event) => select([entry.id], event)}
              onDoubleClick={() => setRenaming(entry.id)}
              title={`${name} · Double-click to rename`}
            >
              {name}
            </button>
          )}
          {flags([entry.id], name)}
        </div>
      )
    })
  }
  return (
    <section className="space-y-3 text-white" aria-label="Layers panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Layers</h2>
        <span className="text-xs text-gray-300">{document.drawings.length} objects</span>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className={panelButton}
          disabled={editableIds.length < 2}
          onClick={actions.groupSelection}
        >
          Group
        </button>
        <button
          type="button"
          className={panelButton}
          disabled={!document.drawings.some((drawing) => selected.has(drawing.id) && drawing.groupId)}
          onClick={actions.ungroupSelection}
        >
          Ungroup
        </button>
        <button
          type="button"
          className={panelButton}
          disabled={!editableIds.length}
          onClick={() => setRenaming(editableIds[0])}
        >
          Rename
        </button>
      </div>
      {!document.drawings.length && !document.groups.length ? (
        <p className="py-6 text-center text-xs leading-5 text-gray-300">
          Your shapes, text and images appear here.
          <br />
          Draw something to get started.
        </p>
      ) : (
        <div className="space-y-0.5">{renderLevel()}</div>
      )}
      <div className="flex flex-wrap gap-1.5 border-t border-gray-500 pt-3">
        <button
          type="button"
          className={panelButton}
          disabled={!editableIds.length}
          onClick={() => actions.updateDocument((current) => reorderDocumentSelection(current, editableIds, 'up'))}
        >
          Raise
        </button>
        <button
          type="button"
          className={panelButton}
          disabled={!editableIds.length}
          onClick={() => actions.updateDocument((current) => reorderDocumentSelection(current, editableIds, 'down'))}
        >
          Lower
        </button>
        <button type="button" className={panelButton} disabled={!editableIds.length} onClick={actions.deleteSelection}>
          Delete
        </button>
      </div>
      <p className="text-[11px] leading-4 text-gray-300">
        Shift-click to select a range. Ctrl / ⌘-click to toggle. Select a row to edit one object inside a group.
      </p>
    </section>
  )
}
