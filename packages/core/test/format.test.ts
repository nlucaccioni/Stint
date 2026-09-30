// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { formatClock, formatDecimalHours, formatHoursMinutes } from '../src/format'
import { HOUR, MIN } from './fixtures'

describe('formatting', () => {
  it('formats a running clock', () => {
    expect(formatClock(0)).toBe('0:00:00')
    expect(formatClock(5 * MIN + 9_999)).toBe('0:05:09')
    expect(formatClock(12 * HOUR)).toBe('12:00:00')
  })

  it('formats hours:minutes, truncating seconds', () => {
    expect(formatHoursMinutes(65 * MIN + 59_000)).toBe('1:05')
    expect(formatHoursMinutes(30 * HOUR)).toBe('30:00')
  })

  it('formats decimal hours', () => {
    expect(formatDecimalHours(90 * MIN)).toBe('1.50')
    expect(formatDecimalHours(20 * MIN)).toBe('0.33')
  })

  it('treats negative durations as zero', () => {
    expect(formatClock(-1)).toBe('0:00:00')
  })
})
