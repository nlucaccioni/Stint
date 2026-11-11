// SPDX-License-Identifier: GPL-3.0-or-later
// Named date ranges for reports ("this week", "last month", custom dates), in the
// user's time zone. All ranges are half-open: [start, end).
import { addDays, addMonths, addWeeks, startOfMonth } from 'date-fns'
import { tz } from '@date-fns/tz'
import { fromLocalParts } from './log'
import { dayRange, weekRange, type WeekStartDay } from './time'
import type { TimeRange } from './types'

export type RangePreset =
  'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'allTime'

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
    case 'allTime':
      return ALL_TIME_RANGE
  }
}

// ---------------------------------------------------------------------------
// The Time tab's range (SPEC.md §6 "Time tab"): a day, week or month that the
// arrows step through, all time, or custom dates.

export type Period = 'day' | 'week' | 'month'

export type TimeSelection =
  /** `offset` counts periods from the current one: 0 = this week, -1 = last week. */
  | { kind: 'period'; period: Period; offset: number }
  | { kind: 'all' }
  /** Inclusive local dates, as in RangeSelection. */
  | { kind: 'custom'; from: string; to: string }

/** Everything, for "All Time". */
export const ALL_TIME_RANGE: TimeRange = { start: 0, end: Number.MAX_SAFE_INTEGER }

export function periodRange(
  period: Period,
  offset: number,
  now: number,
  zone: string,
  weekStartsOn: WeekStartDay,
): TimeRange {
  const opts = { in: tz(zone) }
  // Step from the current period's start, then take the period containing that
  // moment, so DST changes and months of different lengths line up.
  switch (period) {
    case 'day':
      return dayRange(addDays(dayRange(now, zone).start, offset, opts).getTime(), zone)
    case 'week': {
      const start = weekRange(now, zone, weekStartsOn).start
      return weekRange(addWeeks(start, offset, opts).getTime(), zone, weekStartsOn)
    }
    case 'month':
      return monthRange(addMonths(monthRange(now, zone).start, offset, opts).getTime(), zone)
  }
}

export function resolveTimeSelection(
  selection: TimeSelection,
  now: number,
  zone: string,
  weekStartsOn: WeekStartDay,
): TimeRange {
  switch (selection.kind) {
    case 'period':
      return periodRange(selection.period, selection.offset, now, zone, weekStartsOn)
    case 'all':
      return ALL_TIME_RANGE
    case 'custom':
      return resolveRange(selection, now, zone, weekStartsOn)
  }
}

/** The Time tab's version of a Totals range, for "Show Time" from Totals. */
export function toTimeSelection(selection: RangeSelection): TimeSelection {
  if (selection.kind === 'custom') return selection
  if (selection.preset === 'allTime') return { kind: 'all' }
  const periods: Record<Exclude<RangePreset, 'allTime'>, { period: Period; offset: number }> = {
    today: { period: 'day', offset: 0 },
    yesterday: { period: 'day', offset: -1 },
    thisWeek: { period: 'week', offset: 0 },
    lastWeek: { period: 'week', offset: -1 },
    thisMonth: { period: 'month', offset: 0 },
    lastMonth: { period: 'month', offset: -1 },
  }
  return { kind: 'period', ...periods[selection.preset] }
}
