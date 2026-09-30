// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { computeTotals, dailyTotals } from '../src/totals'
import { dayRange } from '../src/time'
import { HOUR, MIN, at, client, project, session } from './fixtures'

const NY = 'America/New_York'
const now = at(2026, 3, 10, 18)
const range = { start: at(2026, 3, 10), end: at(2026, 3, 11) }

const clients = [
  client({ id: 'acme', hourlyRateCents: 10_000, currency: 'USD' }),
  client({ id: 'euro', hourlyRateCents: 8_000, currency: 'EUR' }),
]
const projects = [
  project({ id: 'site', clientId: 'acme' }),
  project({ id: 'app', clientId: 'acme', hourlyRateCents: 15_000 }),
  project({ id: 'eu', clientId: 'euro' }),
]

describe('computeTotals', () => {
  const sessions = [
    session({
      id: '1',
      projectId: 'site',
      startedAt: at(2026, 3, 10, 9),
      endedAt: at(2026, 3, 10, 11),
    }),
    session({
      id: '2',
      projectId: 'app',
      startedAt: at(2026, 3, 10, 11),
      endedAt: at(2026, 3, 10, 12),
    }),
    session({
      id: '3',
      projectId: 'eu',
      startedAt: at(2026, 3, 10, 13),
      endedAt: at(2026, 3, 10, 14),
    }),
    session({
      id: '4',
      projectId: 'site',
      startedAt: at(2026, 3, 10, 14),
      endedAt: at(2026, 3, 10, 15),
      billable: false,
    }),
    session({
      id: '5',
      projectId: 'site',
      startedAt: at(2026, 3, 10, 8),
      endedAt: at(2026, 3, 10, 9),
      deletedAt: 1,
    }),
  ]
  const totals = computeTotals({ sessions, projects, clients, range, now })

  it('sums all time, and billable time separately', () => {
    expect(totals.ms).toBe(5 * HOUR)
    expect(totals.billableMs).toBe(4 * HOUR)
  })

  it('keeps currencies separate and ignores non-billable time for amounts', () => {
    // site 2h × $100 + app 1h × $150 = $350; eu 1h × €80
    expect(totals.amounts).toEqual([
      { currency: 'EUR', cents: 8_000 },
      { currency: 'USD', cents: 35_000 },
    ])
  })

  it('groups by client, largest first', () => {
    expect(totals.byClient.map((c) => [c.clientId, c.ms / HOUR])).toEqual([
      ['acme', 4],
      ['euro', 1],
    ])
  })

  it('groups by project with the effective rate', () => {
    const app = totals.byProject.find((p) => p.projectId === 'app')!
    expect(app).toEqual({
      projectId: 'app',
      clientId: 'acme',
      ms: HOUR,
      billableMs: HOUR,
      amounts: [{ currency: 'USD', cents: 15_000 }],
    })
    expect(totals.byProject.find((p) => p.projectId === 'site')!.ms).toBe(3 * HOUR)
  })

  it('includes a running session up to now', () => {
    const running = session({ projectId: 'site', startedAt: now - 30 * MIN, endedAt: null })
    const t = computeTotals({ sessions: [running], projects, clients, range, now })
    expect(t.ms).toBe(30 * MIN)
    expect(t.amounts).toEqual([{ currency: 'USD', cents: 5_000 }])
  })

  it('counts only the part of a session inside the range', () => {
    const overnight = session({
      projectId: 'site',
      startedAt: at(2026, 3, 9, 22),
      endedAt: at(2026, 3, 10, 2),
    })
    expect(computeTotals({ sessions: [overnight], projects, clients, range, now }).ms).toBe(
      2 * HOUR,
    )
  })

  it('rounds amounts once per total, not per session', () => {
    // Three 1-minute sessions at $100/h = 3 × 166.67 = 500 cents (per-session rounding would give 501)
    const sessions = [0, 1, 2].map((i) =>
      session({
        id: `m${i}`,
        projectId: 'site',
        startedAt: at(2026, 3, 10, 9, i * 2),
        endedAt: at(2026, 3, 10, 9, i * 2 + 1),
      }),
    )
    expect(computeTotals({ sessions, projects, clients, range, now }).amounts).toEqual([
      { currency: 'USD', cents: 500 },
    ])
  })

  it('has no amount when there is no rate', () => {
    const t = computeTotals({
      sessions: [session({ projectId: 'site' })],
      projects,
      clients: [client({ id: 'acme', hourlyRateCents: null })],
      range: { start: 0, end: now },
      now,
    })
    expect(t.billableMs).toBe(HOUR)
    expect(t.amounts).toEqual([])
  })

  it('skips sessions whose project is unknown', () => {
    const t = computeTotals({
      sessions: [session({ projectId: 'nope' })],
      projects,
      clients,
      range,
      now,
    })
    expect(t.ms).toBe(0)
  })
})

describe('dailyTotals', () => {
  it('splits a session crossing local midnight between the two days', () => {
    // 10pm–2am New York time on Mar 9–10 (UTC-4)
    const overnight = session({ startedAt: at(2026, 3, 10, 2), endedAt: at(2026, 3, 10, 6) })
    const range = {
      start: dayRange(at(2026, 3, 9, 16), NY).start,
      end: dayRange(at(2026, 3, 10, 16), NY).end,
    }
    const days = dailyTotals([overnight], range, NY, now)
    expect(days.map((d) => d.ms / HOUR)).toEqual([2, 2])
  })

  it('includes empty days', () => {
    const range = { start: at(2026, 3, 1, 5), end: at(2026, 3, 4, 5) }
    expect(dailyTotals([], range, NY, now).map((d) => d.ms)).toEqual([0, 0, 0])
  })

  it('clips to a range that starts mid-day', () => {
    const s = session({ startedAt: at(2026, 3, 10, 13), endedAt: at(2026, 3, 10, 15) })
    const days = dailyTotals([s], { start: at(2026, 3, 10, 14), end: at(2026, 3, 10, 20) }, NY, now)
    expect(days).toHaveLength(1)
    expect(days[0]!.ms).toBe(HOUR)
  })
})
