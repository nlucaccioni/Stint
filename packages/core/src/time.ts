// SPDX-License-Identifier: GPL-3.0-or-later
// Time math. Everything is stored in UTC; the user's time zone only matters for
// deciding where a "day" or "week" starts. Zones are IANA names like "America/New_York".
import { addDays, addWeeks, startOfDay, startOfWeek } from 'date-fns'
import { tz } from '@date-fns/tz'
import type { Session, TimeRange } from './types'

export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday

/** Session length in ms. A running session counts up to `now`. */
export function sessionDuration(
  session: Pick<Session, 'startedAt' | 'endedAt'>,
  now: number,
): number {
  const end = session.endedAt ?? now
  return Math.max(0, end - session.startedAt)
}

/** The part of a session inside `range`, in ms (0 if they don't overlap). */
export function clippedDuration(
  session: Pick<Session, 'startedAt' | 'endedAt'>,
  range: TimeRange,
  now: number,
): number {
  const start = Math.max(session.startedAt, range.start)
  const end = Math.min(session.endedAt ?? now, range.end)
  return Math.max(0, end - start)
}

/** True if two half-open ranges share any time. Touching end-to-start is not an overlap. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end
}

/** The local day containing `at`. Days are 23 or 25 hours long on DST changes. */
export function dayRange(at: number, zone: string): TimeRange {
  const opts = { in: tz(zone) }
  const start = startOfDay(at, opts)
  return { start: start.getTime(), end: addDays(start, 1, opts).getTime() }
}

/** The local week containing `at`. */
export function weekRange(at: number, zone: string, weekStartsOn: WeekStartDay): TimeRange {
  const opts = { in: tz(zone), weekStartsOn }
  const start = startOfWeek(at, opts)
  return { start: start.getTime(), end: addWeeks(start, 1, opts).getTime() }
}

/** Each local day overlapping `range`, in order. */
export function daysInRange(range: TimeRange, zone: string): TimeRange[] {
  const days: TimeRange[] = []
  let day = dayRange(range.start, zone)
  while (day.start < range.end) {
    days.push(day)
    day = dayRange(day.end, zone)
  }
  return days
}
