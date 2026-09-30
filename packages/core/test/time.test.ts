// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  clippedDuration,
  dayRange,
  daysInRange,
  rangesOverlap,
  sessionDuration,
  weekRange,
} from '../src/time'
import { HOUR, MIN, at } from './fixtures'

const NY = 'America/New_York'

describe('sessionDuration', () => {
  it('uses endedAt for finished sessions', () => {
    expect(sessionDuration({ startedAt: 0, endedAt: 90 * MIN }, 999 * HOUR)).toBe(90 * MIN)
  })

  it('counts a running session up to now', () => {
    expect(sessionDuration({ startedAt: 0, endedAt: null }, 2 * HOUR)).toBe(2 * HOUR)
  })

  it('never goes negative', () => {
    expect(sessionDuration({ startedAt: HOUR, endedAt: null }, 0)).toBe(0)
  })
})

describe('clippedDuration', () => {
  const range = { start: 10 * HOUR, end: 20 * HOUR }

  it('counts a session fully inside the range', () => {
    expect(clippedDuration({ startedAt: 11 * HOUR, endedAt: 12 * HOUR }, range, 0)).toBe(HOUR)
  })

  it('counts only the part inside the range', () => {
    expect(clippedDuration({ startedAt: 9 * HOUR, endedAt: 11 * HOUR }, range, 0)).toBe(HOUR)
    expect(clippedDuration({ startedAt: 19 * HOUR, endedAt: 22 * HOUR }, range, 0)).toBe(HOUR)
    expect(clippedDuration({ startedAt: 0, endedAt: 30 * HOUR }, range, 0)).toBe(10 * HOUR)
  })

  it('is 0 outside the range', () => {
    expect(clippedDuration({ startedAt: 0, endedAt: 10 * HOUR }, range, 0)).toBe(0)
    expect(clippedDuration({ startedAt: 20 * HOUR, endedAt: 21 * HOUR }, range, 0)).toBe(0)
  })

  it('clips a running session at now', () => {
    expect(clippedDuration({ startedAt: 12 * HOUR, endedAt: null }, range, 15 * HOUR)).toBe(
      3 * HOUR,
    )
  })
})

describe('rangesOverlap', () => {
  it('detects overlap', () => {
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true)
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 2, end: 3 })).toBe(true)
  })

  it('treats touching ranges as not overlapping', () => {
    expect(rangesOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false)
  })
})

describe('dayRange', () => {
  it('uses local midnight', () => {
    // 2026-03-10 03:00Z is still March 9 in New York (UTC-4 after DST)
    const day = dayRange(at(2026, 3, 10, 3), NY)
    expect(day).toEqual({ start: at(2026, 3, 9, 4), end: at(2026, 3, 10, 4) })
  })

  it('is 23 hours when clocks spring forward', () => {
    const day = dayRange(at(2026, 3, 8, 12), NY)
    expect(day.end - day.start).toBe(23 * HOUR)
  })

  it('is 25 hours when clocks fall back', () => {
    const day = dayRange(at(2026, 11, 1, 12), NY)
    expect(day.end - day.start).toBe(25 * HOUR)
  })
})

describe('weekRange', () => {
  // Wednesday 2026-03-11, noon in New York
  const wed = at(2026, 3, 11, 16)

  it('starts on Monday when weekStartsOn = 1', () => {
    expect(weekRange(wed, NY, 1)).toEqual({ start: at(2026, 3, 9, 4), end: at(2026, 3, 16, 4) })
  })

  it('starts on Sunday when weekStartsOn = 0', () => {
    expect(weekRange(wed, NY, 0)).toEqual({ start: at(2026, 3, 8, 5), end: at(2026, 3, 15, 4) })
  })
})

describe('daysInRange', () => {
  it('lists each local day overlapping the range', () => {
    const days = daysInRange({ start: at(2026, 3, 7, 12), end: at(2026, 3, 9, 12) }, NY)
    expect(days.map((d) => d.start)).toEqual([
      at(2026, 3, 7, 5),
      at(2026, 3, 8, 5),
      at(2026, 3, 9, 4),
    ])
  })
})
