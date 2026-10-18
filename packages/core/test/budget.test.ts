// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  assertBudgetHasRate,
  budgetFields,
  budgetRange,
  budgetUsage,
  parseHours,
  projectBudget,
  toHoursInput,
  type Budget,
} from '../src/budget'
import { StintError } from '../src/errors'
import { at, client, project, session } from './fixtures'

const NY = 'America/New_York'

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    if (e instanceof StintError) return e.code
    throw e
  }
}

const hours = (h: number, period: Budget['period'] = 'total', resetDay = 1): Budget => ({
  unit: 'minutes',
  amount: h * 60,
  period,
  resetDay,
})

describe('budgetFields', () => {
  it('stores hours and money budgets in their own field', () => {
    expect(budgetFields(hours(20))).toEqual({
      budgetMinutes: 1200,
      budgetCents: null,
      budgetPeriod: 'total',
      budgetResetDay: 1,
    })
    expect(budgetFields({ unit: 'cents', amount: 500_000, period: 'month', resetDay: 15 })).toEqual(
      { budgetMinutes: null, budgetCents: 500_000, budgetPeriod: 'month', budgetResetDay: 15 },
    )
  })

  it('clears with null and round-trips through projectBudget', () => {
    expect(projectBudget(project(budgetFields(null)))).toBeNull()
    const b = { unit: 'cents', amount: 900, period: 'week', resetDay: 1 } as const
    expect(projectBudget(project(budgetFields(b)))).toEqual(b)
  })

  it('ignores the reset day unless the budget is monthly', () => {
    expect(budgetFields(hours(5, 'week', 40)).budgetResetDay).toBe(1)
  })

  it.each([
    [{ amount: 0 }],
    [{ amount: -60 }],
    [{ amount: 1.5 }],
    [{ period: 'year' as Budget['period'] }],
    [{ period: 'month' as const, resetDay: 29 }],
    [{ period: 'month' as const, resetDay: 0 }],
  ])('rejects %o', (bad) => {
    expect(code(() => budgetFields({ ...hours(10), ...bad }))).toBe('invalid-budget')
  })
})

describe('assertBudgetHasRate', () => {
  const money = budgetFields({ unit: 'cents', amount: 100_000, period: 'total', resetDay: 1 })

  it('needs a project or client rate for a money budget', () => {
    const noRate = client({ hourlyRateCents: null })
    expect(code(() => assertBudgetHasRate(project(money), noRate))).toBe('invalid-budget')
    expect(() =>
      assertBudgetHasRate(project({ ...money, hourlyRateCents: 5000 }), noRate),
    ).not.toThrow()
    expect(() => assertBudgetHasRate(project(money), client())).not.toThrow()
  })

  it('allows an hours budget without a rate', () => {
    const p = project(budgetFields(hours(10)))
    expect(() => assertBudgetHasRate(p, client({ hourlyRateCents: null }))).not.toThrow()
  })
})

describe('budgetRange', () => {
  const now = at(2026, 3, 18, 15) // Wednesday 2026-03-18, 11:00 in New York

  it('is unbounded for a fixed budget', () => {
    expect(budgetRange(hours(1), now, NY, 1)).toBeNull()
  })

  it('is the current local week for a weekly budget', () => {
    expect(budgetRange(hours(1, 'week'), now, NY, 1)).toEqual({
      start: at(2026, 3, 16, 4), // Monday midnight EDT
      end: at(2026, 3, 23, 4),
    })
  })

  it('starts on this month’s reset day once it has passed', () => {
    expect(budgetRange(hours(1, 'month', 15), now, NY, 1)).toEqual({
      start: at(2026, 3, 15, 4),
      end: at(2026, 4, 15, 4),
    })
  })

  it('starts on last month’s reset day before it comes round', () => {
    expect(budgetRange(hours(1, 'month', 20), now, NY, 1)).toEqual({
      start: at(2026, 2, 20, 5), // EST before the DST change
      end: at(2026, 3, 20, 4),
    })
  })

  it('resets exactly at local midnight on the reset day', () => {
    const midnight = at(2026, 3, 20, 4)
    expect(budgetRange(hours(1, 'month', 20), midnight, NY, 1)?.start).toBe(midnight)
  })
})

describe('budgetUsage', () => {
  const now = at(2026, 3, 18, 15)
  const base = { client: client(), now, zone: NY, weekStartsOn: 1 as const }

  it('is null without a budget', () => {
    expect(budgetUsage({ ...base, project: project(), sessions: [] })).toBeNull()
  })

  it('counts only this project’s billable, non-deleted sessions, including a running one', () => {
    const p = project(budgetFields(hours(10)))
    const usage = budgetUsage({
      ...base,
      project: p,
      sessions: [
        session({ id: '1', startedAt: at(2026, 1, 5, 9), endedAt: at(2026, 1, 5, 11) }),
        session({ id: '2', startedAt: at(2026, 3, 18, 14), endedAt: null }), // running, 1h
        session({
          id: '3',
          billable: false,
          startedAt: at(2026, 3, 1, 9),
          endedAt: at(2026, 3, 1, 12),
        }),
        session({
          id: '4',
          deletedAt: 1,
          startedAt: at(2026, 3, 2, 9),
          endedAt: at(2026, 3, 2, 12),
        }),
        session({
          id: '5',
          projectId: 'other',
          startedAt: at(2026, 3, 3, 9),
          endedAt: at(2026, 3, 3, 12),
        }),
      ],
    })
    expect(usage).toMatchObject({ range: null, used: 180, fraction: 0.3 })
  })

  it('includes billed sessions in a fixed budget', () => {
    const p = project(budgetFields(hours(2)))
    const usage = budgetUsage({
      ...base,
      project: p,
      sessions: [
        session({
          id: '1',
          billingBatchId: 'b1',
          startedAt: at(2026, 1, 5, 9),
          endedAt: at(2026, 1, 5, 12),
        }),
      ],
    })
    expect(usage?.fraction).toBe(1.5)
  })

  it('clips a rolling budget to the current period', () => {
    const p = project(budgetFields(hours(4, 'week')))
    const usage = budgetUsage({
      ...base,
      project: p,
      sessions: [
        // Sunday 23:00 to Monday 01:00 New York time: only the Monday hour counts.
        session({ id: '1', startedAt: at(2026, 3, 16, 3), endedAt: at(2026, 3, 16, 5) }),
        session({ id: '2', startedAt: at(2026, 3, 9, 12), endedAt: at(2026, 3, 9, 15) }), // last week
      ],
    })
    expect(usage).toMatchObject({ used: 60, fraction: 0.25 })
  })

  it('measures money at the billed rate for billed sessions and the effective rate otherwise', () => {
    const p = project({
      ...budgetFields({ unit: 'cents', amount: 100_000, period: 'total', resetDay: 1 }),
      hourlyRateCents: 15_000,
    })
    const usage = budgetUsage({
      ...base,
      project: p,
      sessions: [
        session({
          id: '1',
          billingBatchId: 'b1',
          billedRateCents: 12_000,
          startedAt: at(2026, 1, 5, 9),
          endedAt: at(2026, 1, 5, 11),
        }),
        session({ id: '2', startedAt: at(2026, 3, 2, 9), endedAt: at(2026, 3, 2, 9, 30) }),
      ],
    })
    // 2h × $120 + 0.5h × $150 = $315
    expect(usage).toMatchObject({ used: 31_500, fraction: 0.315 })
  })

  it('has no usage for a money budget once the rate is gone', () => {
    const p = project(
      budgetFields({ unit: 'cents', amount: 100_000, period: 'total', resetDay: 1 }),
    )
    const usage = budgetUsage({
      ...base,
      client: client({ hourlyRateCents: null }),
      project: p,
      sessions: [session()],
    })
    expect(usage).toMatchObject({ used: null, fraction: null })
  })
})

describe('parseHours / toHoursInput', () => {
  it.each([
    ['20', 1200],
    ['12.5', 750],
    ['12,5', 750],
    ['1:30', 90],
    [' 8 ', 480],
    ['', null],
  ])('parses %j', (text, minutes) => {
    expect(parseHours(text)).toBe(minutes)
  })

  it.each(['abc', '1.2.3', '-4', '1:75'])('rejects %j', (text) => {
    expect(code(() => parseHours(text))).toBe('invalid-budget')
  })

  it('formats minutes as hours', () => {
    expect(toHoursInput(1200)).toBe('20')
    expect(toHoursInput(750)).toBe('12.5')
    expect(toHoursInput(100)).toBe('1.67')
  })
})
