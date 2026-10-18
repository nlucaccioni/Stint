// SPDX-License-Identifier: GPL-3.0-or-later
// A ⋯ button that opens a short list of actions (Edit, Archive, Delete).
//
// The list is a native popover: the browser shows it above everything (so a
// card's overflow can't clip it), closes it on Escape or an outside click, and
// returns focus to the button. CSS anchor positioning places it under the button.
import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { Ellipsis } from 'lucide-react'
import { IconButton } from './IconButton'
import styles from './Menu.module.css'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Shown in the danger color, e.g. Delete. */
  danger?: boolean
  disabled?: boolean
}

export interface MenuProps {
  /** Accessible name for the button, e.g. "Actions for Acme Studio". */
  label: string
  items: readonly MenuItem[]
}

export function Menu({ label, items }: MenuProps) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  // useId can contain characters that aren't valid in a CSS name.
  const anchor = `--menu-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`

  function itemsInList(): HTMLButtonElement[] {
    return [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []),
    ].filter((b) => !b.disabled)
  }

  function onToggle(e: { newState?: string }) {
    if (e.newState === 'open') itemsInList()[0]?.focus()
  }

  // Arrow keys move between items, as in a native menu.
  function onKeyDown(e: KeyboardEvent) {
    const all = itemsInList()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'ArrowDown'
        ? (at + 1) % all.length
        : e.key === 'ArrowUp'
          ? (at - 1 + all.length) % all.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : null
    if (next === null) return
    e.preventDefault()
    all[next]?.focus()
  }

  return (
    <>
      <IconButton
        label={label}
        aria-haspopup="menu"
        className={styles.trigger}
        popoverTarget={id}
        style={{ anchorName: anchor } as CSSProperties}
      >
        <Ellipsis aria-hidden />
      </IconButton>
      <div
        ref={listRef}
        id={id}
        popover="auto"
        role="menu"
        aria-label={label}
        className={styles.menu}
        style={{ positionAnchor: anchor } as CSSProperties}
        onToggle={onToggle}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={styles.item}
            data-danger={item.danger || undefined}
            disabled={item.disabled}
            onClick={() => {
              listRef.current?.hidePopover()
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
