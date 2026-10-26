// SPDX-License-Identifier: GPL-3.0-or-later
// A dropdown styled to the design (native <select> lists are drawn by the OS).
//
// Like Menu, the list is a native popover placed with CSS anchor positioning: it
// shows above everything (dialogs included), closes on Escape or an outside click,
// and returns focus to the button. Arrow keys move through the options.
import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import styles from './Select.module.css'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
}

export interface SelectProps<T extends string | number> {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  /** Set by Field: the label's target, plus its styling and hint wiring. */
  id?: string
  className?: string
  'aria-describedby'?: string
  /** Accessible name when the Select isn't inside a Field. */
  'aria-label'?: string
  /** Monospace text, for numbers like "01". */
  mono?: boolean
  disabled?: boolean
}

export function Select<T extends string | number>(props: SelectProps<T>) {
  const { value, options, onChange } = props
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // useId can contain characters that aren't valid in a CSS name.
  const anchor = `--select-${listId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const selected = options.find((o) => o.value === value)

  function optionButtons(): HTMLButtonElement[] {
    return [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])]
  }

  function onToggle(e: { newState?: string }) {
    if (e.newState !== 'open') return
    const buttons = optionButtons()
    const current = buttons.find((b) => b.getAttribute('aria-selected') === 'true')
    ;(current ?? buttons[0])?.focus()
  }

  function onKeyDown(e: KeyboardEvent) {
    const all = optionButtons()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'ArrowDown'
        ? Math.min(at + 1, all.length - 1)
        : e.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : null
    if (next === null) return
    e.preventDefault()
    all[next]?.focus()
  }

  function choose(v: T) {
    listRef.current?.hidePopover()
    triggerRef.current?.focus()
    if (v !== value) onChange(v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={props.id}
        className={[styles.trigger, props.className].filter(Boolean).join(' ')}
        data-mono={props.mono || undefined}
        aria-haspopup="listbox"
        aria-describedby={props['aria-describedby']}
        aria-label={props['aria-label']}
        disabled={props.disabled}
        popoverTarget={listId}
        style={{ anchorName: anchor } as CSSProperties}
      >
        <span className={styles.value}>{selected?.label ?? ''}</span>
        <ChevronDown className={styles.chevron} aria-hidden />
      </button>
      <div
        ref={listRef}
        id={listId}
        popover="auto"
        role="listbox"
        aria-label={props['aria-label']}
        className={styles.list}
        data-mono={props.mono || undefined}
        style={{ positionAnchor: anchor } as CSSProperties}
        onToggle={onToggle}
        onKeyDown={onKeyDown}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="option"
            aria-selected={o.value === value}
            className={styles.option}
            onClick={() => choose(o.value)}
          >
            <span>{o.label}</span>
            {o.value === value && <Check className={styles.check} aria-hidden />}
          </button>
        ))}
      </div>
    </>
  )
}
