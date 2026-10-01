// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { fromLocalParts, groupByDay, localSpan, toLocalParts } from '../src/log'
import { HOUR, at, session } from './fixtures'

const NY = 'America/New_York'
const now = at(2026, 3, 11, 20)

describe('groupByDay', () => {
  it('groups by local start day, newest day and session first', () => {
    const sessions = [
      session({ id: 'mon-am', startedAt: at(2026, 3, 9, 13), endedAt: at(2026, 3, 9, 14) }),
      session({ id: 'tue', startedAt: at(2026, 3, 10, 13), endedAt: at(2026, 3, 10, 15) }),
      session({ id: 'mon-pm', startedAt: at(2026, 3, 9, 18), endedAt: at(2026, 3, 9, 19) }),
      // 11pm Monday in New York = 03:00Z Tuesday: still Monday locally
      session({ id: 'mon-late', startedAt: at(2026, 3, 10, 3), endedAt: at(2026, 3, 10, 4) }),
      session({ id: 'gone', startedAt: at(2026, 3, 10, 13), deletedAt: 1 }),
    ]
    const days = groupByDay(sessions, NY, now)
    expect(days.map((d) => d.sessions.map((s) => s.id))).toEqual([
      ['tue'],
      ['mon-late', 'mon-pm', 'mon-am'],
    ])
    expect(days.map((d) => d.ms / HOUR)).toEqual([2, 3])
  })

  it('counts a running session up to now', () => {
    const days = groupByDay([session({ startedAt: now - HOUR, endedAt: null })], NY, now)
    expect(days[0]!.ms).toBe(HOUR)
  })
})

describe('local date/time conversion', () => {
  it('round-trips through the zone', () => {
    const ms = at(2026, 3, 10, 18, 45)
    expect(toLocalParts(ms, NY)).toEqual({ date: '2026-03-10', time: '14:45' })
    expect(fromLocalParts('2026-03-10', '14:45', NY)).toBe(ms)
  })

  it('handles the day clocks spring forward', () => {
    // Mar 8 2026: 1:30am is EST (UTC-5), 3:30am is EDT (UTC-4)
    expect(fromLocalParts('2026-03-08', '01:30', NY)).toBe(at(2026, 3, 8, 6, 30))
    expect(fromLocalParts('2026-03-08', '03:30', NY)).toBe(at(2026, 3, 8, 7, 30))
  })

  it('returns NaN for malformed input', () => {
    expect(fromLocalParts('2026-3-1', '14:45', NY)).toBeNaN()
    expect(fromLocalParts('2026-03-10', '2pm', NY)).toBeNaN()
  })
})

describe('localSpan', () => {
  it('uses the same day when end is after start', () => {
    expect(localSpan('2026-03-10', '09:00', '10:30', NY)).toEqual({
      startedAt: at(2026, 3, 10, 13),
      endedAt: at(2026, 3, 10, 14, 30),
    })
  })

  it('moves the end to the next day for overnight sessions', () => {
    expect(localSpan('2026-03-10', '22:00', '01:00', NY)).toEqual({
      startedAt: at(2026, 3, 11, 2),
      endedAt: at(2026, 3, 11, 5),
    })
  })

  it('gets real duration right across a DST change', () => {
    // Overnight Mar 7→8 2026: clocks skip 2am, so 22:00→06:00 is 7 hours, not 8
    const { startedAt, endedAt } = localSpan('2026-03-07', '22:00', '06:00', NY)
    expect((endedAt - startedAt) / HOUR).toBe(7)
  })
})
