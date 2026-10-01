// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { monthRange, resolveRange, type RangePreset } from '../src/ranges'
import { HOUR, at } from './fixtures'

const NY = 'America/New_York'
// Wednesday 2026-03-11, 10:00 in New York (EDT, UTC-4)
const now = at(2026, 3, 11, 14)

const preset = (p: RangePreset) => resolveRange({ kind: 'preset', preset: p }, now, NY, 1)

describe('resolveRange presets', () => {
  it('today and yesterday', () => {
    expect(preset('today')).toEqual({ start: at(2026, 3, 11, 4), end: at(2026, 3, 12, 4) })
    expect(preset('yesterday')).toEqual({ start: at(2026, 3, 10, 4), end: at(2026, 3, 11, 4) })
  })

  it('this week and last week (Monday start, across the DST change)', () => {
    expect(preset('thisWeek')).toEqual({ start: at(2026, 3, 9, 4), end: at(2026, 3, 16, 4) })
    // Last week began Mon Mar 2 in EST (UTC-5) and ran 167 hours because clocks sprang forward
    const last = preset('lastWeek')
    expect(last).toEqual({ start: at(2026, 3, 2, 5), end: at(2026, 3, 9, 4) })
    expect((last.end - last.start) / HOUR).toBe(167)
  })

  it('this month and last month', () => {
    expect(preset('thisMonth')).toEqual({ start: at(2026, 3, 1, 5), end: at(2026, 4, 1, 4) })
    expect(preset('lastMonth')).toEqual({ start: at(2026, 2, 1, 5), end: at(2026, 3, 1, 5) })
  })
})

describe('resolveRange custom', () => {
  it('covers whole local days, inclusive', () => {
    expect(
      resolveRange({ kind: 'custom', from: '2026-03-01', to: '2026-03-03' }, now, NY, 1),
    ).toEqual({
      start: at(2026, 3, 1, 5),
      end: at(2026, 3, 4, 5),
    })
  })

  it('swaps a backwards range', () => {
    const r = resolveRange({ kind: 'custom', from: '2026-03-03', to: '2026-03-01' }, now, NY, 1)
    expect(r.start).toBe(at(2026, 3, 1, 5))
  })
})

describe('monthRange', () => {
  it('handles December into January', () => {
    expect(monthRange(at(2026, 12, 15, 12), NY)).toEqual({
      start: at(2026, 12, 1, 5),
      end: at(2027, 1, 1, 5),
    })
  })
})
