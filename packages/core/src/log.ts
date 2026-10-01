// SPDX-License-Identifier: GPL-3.0-or-later
// Helpers for the session log and its edit forms. Forms work in local date/time
// strings ("2026-03-10", "14:30"); the database works in UTC ms. These convert
// between the two for a given IANA zone, including across DST changes.
import { format } from 'date-fns'
import { TZDate, tz } from '@date-fns/tz'
import { dayRange, sessionDuration } from './time'
import type { Session, TimeRange } from './types'

export interface LogDay {
  day: TimeRange
  /** Newest first. */
  sessions: Session[]
  /** Total length of the sessions listed (a running one counts up to now). */
  ms: number
}

/**
 * Group sessions by the local day they started on, newest day first. A session
 * that runs past midnight is listed (and counted) under the day it started.
 */
export function groupByDay(sessions: readonly Session[], zone: string, now: number): LogDay[] {
  const days = new Map<number, LogDay>()
  for (const session of sessions) {
    if (session.deletedAt !== null) continue
    const day = dayRange(session.startedAt, zone)
    let entry = days.get(day.start)
    if (!entry) days.set(day.start, (entry = { day, sessions: [], ms: 0 }))
    entry.sessions.push(session)
    entry.ms += sessionDuration(session, now)
  }
  const result = [...days.values()].sort((a, b) => b.day.start - a.day.start)
  for (const d of result) d.sessions.sort((a, b) => b.startedAt - a.startedAt)
  return result
}

export interface LocalParts {
  /** "2026-03-10" */
  date: string
  /** "14:30" */
  time: string
}

export function toLocalParts(ms: number, zone: string): LocalParts {
  const opts = { in: tz(zone) }
  return { date: format(ms, 'yyyy-MM-dd', opts), time: format(ms, 'HH:mm', opts) }
}

/** "2026-03-10" + "14:30" in `zone` → UTC ms. Returns NaN if either is malformed. */
export function fromLocalParts(date: string, time: string, zone: string): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return Number.NaN
  return new TZDate(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!, zone).getTime()
}

/**
 * A start and end typed as times on one date. An end at or before the start means
 * the session ran past midnight, so the end is on the following day.
 */
export function localSpan(
  date: string,
  startTime: string,
  endTime: string,
  zone: string,
): { startedAt: number; endedAt: number } {
  const startedAt = fromLocalParts(date, startTime, zone)
  let endedAt = fromLocalParts(date, endTime, zone)
  if (endedAt <= startedAt) {
    const next = toLocalParts(dayRange(startedAt, zone).end, zone).date
    endedAt = fromLocalParts(next, endTime, zone)
  }
  return { startedAt, endedAt }
}
