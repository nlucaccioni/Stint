// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react'
import { formatClock, sessionDuration, toLocalParts, type Project, type Session } from '@stint/core'
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
}) {
  const { session: s, zone } = props
  const start = toLocalParts(s.startedAt, zone).time
  const end = s.endedAt === null ? 'now' : toLocalParts(s.endedAt, zone).time
  return (
    <li className={styles.sessionRow}>
      {props.before}
      <span className={styles.muted}>{formatDay(s.startedAt, zone)}</span>
      <span className={styles.muted}>
        {start}–{end}
      </span>
      <span className={styles.sessionWhat}>
        {props.project?.name ?? 'Unknown project'}
        {s.note && <span className={styles.muted}> · {s.note}</span>}
      </span>
      <span className={styles.num}>{formatClock(sessionDuration(s, props.now))}</span>
      {props.after}
    </li>
  )
}
