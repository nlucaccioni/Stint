// SPDX-License-Identifier: GPL-3.0-or-later
// Named date ranges for reports ("this week", "last month", custom dates), in the
// user's time zone. All ranges are half-open: [start, end).
import { addMonths, startOfMonth } from 'date-fns'
import { tz } from '@date-fns/tz'
import { fromLocalParts } from './log'
import { dayRange, weekRange, type WeekStartDay } from './time'
import type { TimeRange } from './types'

export type RangePreset =
  'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'

export type RangeSelection =
  | { kind: 'preset'; preset: RangePreset }
  /** Inclusive local dates, "2026-03-01" to "2026-03-31". */
  | { kind: 'custom'; from: string; to: string }

export function monthRange(at: number, zone: string): TimeRange {
  const opts = { in: tz(zone) }
  const start = startOfMonth(at, opts)
  return { start: start.getTime(), end: addMonths(start, 1, opts).getTime() }
}

/** The time range a selection covers right now. Custom ranges with to < from are swapped. */
export function resolveRange(
  selection: RangeSelection,
  now: number,
  zone: string,
  weekStartsOn: WeekStartDay,
): TimeRange {
  if (selection.kind === 'custom') {
    const [from, to] =
      selection.from <= selection.to
        ? [selection.from, selection.to]
        : [selection.to, selection.from]
    return {
      start: dayRange(fromLocalParts(from, '12:00', zone), zone).start,
      end: dayRange(fromLocalParts(to, '12:00', zone), zone).end,
    }
  }
  switch (selection.preset) {
    case 'today':
      return dayRange(now, zone)
    case 'yesterday':
      return dayRange(dayRange(now, zone).start - 1, zone)
    case 'thisWeek':
      return weekRange(now, zone, weekStartsOn)
    case 'lastWeek':
      return weekRange(weekRange(now, zone, weekStartsOn).start - 1, zone, weekStartsOn)
    case 'thisMonth':
      return monthRange(now, zone)
    case 'lastMonth':
      return monthRange(monthRange(now, zone).start - 1, zone)
  }
}
