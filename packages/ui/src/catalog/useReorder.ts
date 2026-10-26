// SPDX-License-Identifier: GPL-3.0-or-later
// Drag-to-reorder for one list: the clients, or one client's projects (SPEC.md §5
// "Ordering"). Uses native drag and drop. A small grip starts the drag, so text in
// the rows stays selectable, and the whole row is shown as the drag image. While
// dragging over a row, its top or bottom half decides whether the item lands before
// or after it, shown with a line (`data-drop`).
import { useState, type DragEvent } from 'react'

/** What's being dragged right now, across every list (drag data isn't readable mid-drag). */
let current: { scope: string; id: string } | null = null

type Where = 'before' | 'after'

export function useReorder(
  /** Items only move within their own scope, e.g. "clients" or "projects:<clientId>". */
  scope: string,
  /** The visible items, in order. */
  ids: readonly string[],
  /** Puts `id` just before `beforeId` (null = at the end). */
  onMove: (id: string, beforeId: string | null) => void,
) {
  const [drop, setDrop] = useState<{ id: string; where: Where } | null>(null)

  /** beforeId for landing just after `id` (the next visible item, or the end). */
  const afterTarget = (id: string) => ids[ids.indexOf(id) + 1] ?? null

  function move(id: string, beforeId: string | null) {
    // Dropping right where it already is does nothing.
    if (beforeId === id || afterTarget(id) === beforeId) return
    onMove(id, beforeId)
  }

  function handleProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        current = { scope, id }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        const row = e.currentTarget.closest<HTMLElement>('[data-reorder-item]')
        if (row) {
          const box = row.getBoundingClientRect()
          e.dataTransfer.setDragImage(row, e.clientX - box.left, e.clientY - box.top)
        }
      },
      onDragEnd: () => {
        current = null
        setDrop(null)
      },
    }
  }

  function itemProps(id: string) {
    const accepts = () => current !== null && current.scope === scope && current.id !== id
    return {
      'data-reorder-item': '',
      'data-drop': drop?.id === id ? drop.where : undefined,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts()) return
        e.preventDefault() // allow the drop
        e.stopPropagation() // a project row is inside a client card
        e.dataTransfer.dropEffect = 'move'
        const box = e.currentTarget.getBoundingClientRect()
        const where: Where = e.clientY < box.top + box.height / 2 ? 'before' : 'after'
        if (drop?.id !== id || drop.where !== where) setDrop({ id, where })
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        // Only when leaving the row itself, not moving between its children.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDrop((d) => (d?.id === id ? null : d))
        }
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!accepts() || !current) return
        e.preventDefault()
        e.stopPropagation()
        const where = drop?.id === id ? drop.where : 'before'
        move(current.id, where === 'before' ? id : afterTarget(id))
        current = null
        setDrop(null)
      },
    }
  }

  /** Move Up / Move Down menu items, disabled at the ends of the list. */
  function menuItems(id: string) {
    const at = ids.indexOf(id)
    return [
      {
        label: 'Move Up',
        disabled: at <= 0,
        onSelect: () => onMove(id, ids[at - 1]!),
      },
      {
        label: 'Move Down',
        disabled: at === -1 || at >= ids.length - 1,
        onSelect: () => onMove(id, ids[at + 2] ?? null),
      },
    ]
  }

  return { handleProps, itemProps, menuItems }
}
