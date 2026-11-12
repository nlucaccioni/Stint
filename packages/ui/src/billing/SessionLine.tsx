// SPDX-License-Identifier: GPL-3.0-or-later
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { formatClock, sessionDuration, toLocalParts, type Project, type Session } from '@stint/core'
import { CheckInput } from '../components/Field'
import { formatDay } from './format'
import styles from './BillingView.module.css'

/** One session in a batch list: date, times, project, note, duration. */
export function SessionLine(props: {
  session: Session
  project: Project | undefined
  zone: string
  now: number
  /** A checkbox or button at the start/end of the row. */
  before?: ReactNode
  after?: ReactNode
  /** Called when the pointer moves onto the row (for drag to tick). */
  onPointerEnter?: () => void
}) {
  const { session: s, zone } = props
  const start = toLocalParts(s.startedAt, zone).time
  const end = s.endedAt === null ? 'now' : toLocalParts(s.endedAt, zone).time
  return (
    <li className={styles.sessionRow} onPointerEnter={props.onPointerEnter}>
      {props.before}
      <span className={styles.muted}>{formatDay(s.startedAt, zone)}</span>
      <span className={styles.muted}>
        {start}–{end}
      </span>
      <span className={styles.sessionWhat}>
        {props.project?.name ?? 'Unknown Project'}
        {s.note && <span className={styles.muted}> · {s.note}</span>}
      </span>
      <span className={styles.num}>{formatClock(sessionDuration(s, props.now))}</span>
      {props.after}
    </li>
  )
}

/**
 * A session list's checkbox, ready for drag to tick: pressing anywhere in its
 * padded box ticks it, and dragging over other rows gives them the same state.
 */
export function SessionTick(props: {
  checked: boolean
  label: string
  onToggle: (on: boolean) => void
  onPointerDown: (e: PointerEvent) => void
  onClick: (e: MouseEvent) => void
}) {
  return (
    <span className={styles.tick} onPointerDown={props.onPointerDown}>
      <CheckInput
        aria-label={props.label}
        checked={props.checked}
        onClick={props.onClick}
        onChange={(e) => props.onToggle(e.target.checked)}
      />
    </span>
  )
}
