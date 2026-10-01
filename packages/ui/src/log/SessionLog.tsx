// SPDX-License-Identifier: GPL-3.0-or-later
// Recorded time for one week, grouped by day (newest first). Click a row to edit.
import { useMemo } from 'react'
import {
  formatHoursMinutes,
  groupByDay,
  projectColor,
  sessionDuration,
  toLocalParts,
  type Client,
  type Project,
  type Session,
  type TimeRange,
} from '@stint/core'
import { Button } from '../components/Button'
import { useNow } from '../timer/useNow'
import styles from './SessionLog.module.css'

export interface SessionLogProps {
  week: TimeRange
  isCurrentWeek: boolean
  sessions: readonly Session[]
  projects: readonly Project[]
  clients: readonly Client[]
  zone: string
  onPrevWeek: () => void
  onNextWeek: () => void
  onThisWeek: () => void
  onAdd: () => void
  onEdit: (session: Session) => void
}

export function SessionLog(props: SessionLogProps) {
  const { sessions, zone } = props
  const hasRunning = sessions.some((s) => s.endedAt === null)
  const now = useNow(hasRunning)
  const days = useMemo(() => groupByDay(sessions, zone, now), [sessions, zone, now])
  const weekTotal = days.reduce((sum, d) => sum + d.ms, 0)

  const projects = useMemo(() => new Map(props.projects.map((p) => [p.id, p])), [props.projects])
  const clients = useMemo(() => new Map(props.clients.map((c) => [c.id, c])), [props.clients])

  return (
    <section className={styles.log}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Time</h1>
        <div className={styles.nav}>
          <Button size="sm" variant="ghost" aria-label="Previous week" onClick={props.onPrevWeek}>
            ‹
          </Button>
          <span className={styles.week}>{weekLabel(props.week, zone)}</span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Next week"
            onClick={props.onNextWeek}
            disabled={props.isCurrentWeek}
          >
            ›
          </Button>
          {!props.isCurrentWeek && (
            <Button size="sm" variant="ghost" onClick={props.onThisWeek}>
              This week
            </Button>
          )}
        </div>
        <span className={styles.total}>{formatHoursMinutes(weekTotal)}</span>
        <Button variant="primary" onClick={props.onAdd}>
          Add time
        </Button>
      </header>

      {days.length === 0 && <p className={styles.empty}>No time recorded this week.</p>}

      {days.map(({ day, sessions: daySessions, ms }) => (
        <div key={day.start} className={styles.day}>
          <div className={styles.dayHeader}>
            <span>{dayLabel(day.start, zone, now)}</span>
            <span className={styles.dayTotal}>{formatHoursMinutes(ms)}</span>
          </div>
          <ul className={styles.rows}>
            {daySessions.map((s) => {
              const project = projects.get(s.projectId)
              const client = project && clients.get(project.clientId)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.row}
                    data-running={s.endedAt === null || undefined}
                    onClick={() => props.onEdit(s)}
                  >
                    <span
                      className={styles.swatch}
                      style={{
                        background: project && client ? projectColor(project, client) : undefined,
                      }}
                      aria-hidden
                    />
                    <span className={styles.what}>
                      <span className={styles.project}>
                        {project?.name ?? 'Unknown project'}
                        {client && <span className={styles.client}> · {client.name}</span>}
                      </span>
                      {s.note && <span className={styles.note}>{s.note}</span>}
                    </span>
                    {!s.billable && <span className={styles.tag}>Non-billable</span>}
                    <span className={styles.times}>
                      {toLocalParts(s.startedAt, zone).time}–
                      {s.endedAt === null ? 'now' : toLocalParts(s.endedAt, zone).time}
                    </span>
                    <span className={styles.duration}>
                      {formatHoursMinutes(sessionDuration(s, now))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

function weekLabel(week: TimeRange, zone: string): string {
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: zone })
  return `${fmt.format(week.start)} – ${fmt.format(week.end - 1)}`
}

function dayLabel(dayStart: number, zone: string, now: number): string {
  const day = toLocalParts(dayStart, zone).date
  if (day === toLocalParts(now, zone).date) return 'Today'
  if (day === toLocalParts(now - 86_400_000, zone).date) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: zone,
  }).format(dayStart)
}
