// SPDX-License-Identifier: GPL-3.0-or-later
// A date field styled like the app (the native <input type="date"> calendar is drawn
// by the browser/OS). The button shows the date; it opens a month calendar in a
// native popover, like Select and ColorPicker. Values are local "YYYY-MM-DD".
//
// Keyboard: arrows move a day/week, PageUp/PageDown a month, Home/End the week's
// ends, Enter or Space picks, Esc closes.
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './IconButton'
import styles from './DateInput.module.css'

export interface DateInputProps {
  /** "YYYY-MM-DD", or "" for none. */
  value: string
  onChange: (value: string) => void
  /** First column of the calendar: 0 = Sunday … 6 = Saturday. Default Monday. */
  weekStartsOn?: number
  /** Set by Field: the label's target, plus its hint wiring. */
  id?: string
  className?: string
  'aria-describedby'?: string
  'aria-label'?: string
  disabled?: boolean
}

interface Ymd {
  y: number
  m: number // 0-based
  d: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const toValue = ({ y, m, d }: Ymd) => `${y}-${pad(m + 1)}-${pad(d)}`
const toDate = ({ y, m, d }: Ymd) => new Date(y, m, d)
const fromDate = (date: Date): Ymd => ({
  y: date.getFullYear(),
  m: date.getMonth(),
  d: date.getDate(),
})
const sameDay = (a: Ymd | null, b: Ymd | null) =>
  !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d

function parse(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null
}

/** Moves a date by days or months, keeping it valid (Jan 31 + 1 month → Feb 28). */
function shift(date: Ymd, days: number, months = 0): Ymd {
  if (months) {
    const last = new Date(date.y, date.m + months + 1, 0).getDate()
    return fromDate(new Date(date.y, date.m + months, Math.min(date.d, last)))
  }
  return fromDate(new Date(date.y, date.m, date.d + days))
}

export function DateInput(props: DateInputProps) {
  const { value, onChange, weekStartsOn = 1 } = props
  const panelId = useId()
  const anchor = `--date-${panelId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = parse(value)
  const today = fromDate(new Date())
  // The day with keyboard focus; it also decides which month is shown.
  const [focus, setFocus] = useState<Ymd>(selected ?? today)

  const label = selected
    ? toDate(selected).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Pick a Date'

  // Six weeks starting on the week-start day on or before the 1st.
  const first = new Date(focus.y, focus.m, 1)
  const lead = (first.getDay() - weekStartsOn + 7) % 7
  const days = Array.from({ length: 42 }, (_, i) =>
    fromDate(new Date(focus.y, focus.m, 1 - lead + i)),
  )
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-07 was a Sunday.
    new Date(2024, 0, 7 + ((weekStartsOn + i) % 7)).toLocaleDateString(undefined, {
      weekday: 'narrow',
    }),
  )
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  function focusDay(next: Ymd) {
    setFocus(next)
    // After React renders the (possibly new) month, move focus to that day.
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toValue(next)}"]`)?.focus(),
    )
  }

  function onToggle(e: { newState?: string }) {
    if (e.newState !== 'open') return
    focusDay(selected ?? today)
  }

  function choose(day: Ymd) {
    panelRef.current?.hidePopover()
    triggerRef.current?.focus()
    if (toValue(day) !== value) onChange(toValue(day))
  }

  function onGridKey(e: KeyboardEvent) {
    const dow = (toDate(focus).getDay() - weekStartsOn + 7) % 7
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => shift(focus, -1),
      ArrowRight: () => shift(focus, 1),
      ArrowUp: () => shift(focus, -7),
      ArrowDown: () => shift(focus, 7),
      PageUp: () => shift(focus, 0, -1),
      PageDown: () => shift(focus, 0, 1),
      Home: () => shift(focus, -dow),
      End: () => shift(focus, 6 - dow),
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    focusDay(move())
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={props.id}
        className={[styles.trigger, props.className].filter(Boolean).join(' ')}
        data-empty={selected ? undefined : ''}
        aria-haspopup="dialog"
        aria-describedby={props['aria-describedby']}
        aria-label={props['aria-label'] ? `${props['aria-label']}: ${label}` : undefined}
        disabled={props.disabled}
        popoverTarget={panelId}
        style={{ anchorName: anchor } as CSSProperties}
      >
        <span className={styles.value}>{label}</span>
        <CalendarDays className={styles.icon} aria-hidden />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Choose date"
        className={styles.panel}
        style={{ positionAnchor: anchor } as CSSProperties}
        onToggle={onToggle}
      >
        <div className={styles.header}>
          <IconButton
            size="md"
            label="Previous Month"
            onClick={() => focusDay(shift(focus, 0, -1))}
          >
            <ChevronLeft aria-hidden />
          </IconButton>
          <span className={styles.month} aria-live="polite">
            {monthLabel}
          </span>
          <IconButton size="md" label="Next Month" onClick={() => focusDay(shift(focus, 0, 1))}>
            <ChevronRight aria-hidden />
          </IconButton>
        </div>
        <div className={styles.grid} role="grid" aria-label={monthLabel} onKeyDown={onGridKey}>
          {weekdays.map((w, i) => (
            <span key={i} className={styles.weekday} aria-hidden>
              {w}
            </span>
          ))}
          {days.map((day) => {
            const key = toValue(day)
            return (
              <button
                key={key}
                type="button"
                data-day={key}
                className={styles.day}
                data-outside={day.m !== focus.m || undefined}
                data-today={sameDay(day, today) || undefined}
                aria-selected={sameDay(day, selected)}
                aria-label={toDate(day).toLocaleDateString(undefined, { dateStyle: 'full' })}
                // Only the focused day is in the tab order; arrows move between days.
                tabIndex={sameDay(day, focus) ? 0 : -1}
                onClick={() => choose(day)}
              >
                {day.d}
              </button>
            )
          })}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.todayButton} onClick={() => choose(today)}>
            Today
          </button>
        </div>
      </div>
    </>
  )
}
