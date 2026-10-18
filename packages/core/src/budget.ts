// SPDX-License-Identifier: GPL-3.0-or-later
// Project budgets (SPEC.md §6 "Budgets"): an optional cap in hours or money, either
// fixed for the life of the project or rolling weekly/monthly. Usage is always
// derived from sessions; Stint never enforces the cap.
import { addMonths, setDate, startOfMonth } from 'date-fns'
import { tz } from '@date-fns/tz'
import { StintError } from './errors'
import { effectiveRate, exactAmountCents } from './rates'
import { clippedDuration, weekRange, type WeekStartDay } from './time'
import type { BudgetPeriod, Client, Project, Session, TimeRange } from './types'

/** A budget as entered: hours budgets are stored in minutes, money in cents. */
export interface Budget {
  unit: 'minutes' | 'cents'
  amount: number
  period: BudgetPeriod
  /** Day of the month (1–28) a monthly budget resets. Ignored for other periods. */
  resetDay: number
}

type BudgetFields = Pick<
  Project,
  'budgetMinutes' | 'budgetCents' | 'budgetPeriod' | 'budgetResetDay'
>

const ALL_TIME: TimeRange = { start: -Infinity, end: Infinity }
const MAX_MINUTES = 100_000 * 60 // 100,000 hours
const MAX_CENTS = 10_000_000_000 // 100 million in major units

/** The project's budget, or null if it has none. */
export function projectBudget(project: BudgetFields): Budget | null {
  const { budgetPeriod: period, budgetResetDay: resetDay } = project
  if (project.budgetMinutes !== null) {
    return { unit: 'minutes', amount: project.budgetMinutes, period, resetDay }
  }
  if (project.budgetCents !== null) {
    return { unit: 'cents', amount: project.budgetCents, period, resetDay }
  }
  return null
}

/** Validates a budget and turns it into project fields. null clears the budget. */
export function budgetFields(budget: Budget | null): BudgetFields {
  if (budget === null) {
    return { budgetMinutes: null, budgetCents: null, budgetPeriod: 'total', budgetResetDay: 1 }
  }
  const max = budget.unit === 'minutes' ? MAX_MINUTES : MAX_CENTS
  if (!Number.isInteger(budget.amount) || budget.amount <= 0 || budget.amount > max) {
    throw new StintError('invalid-budget', 'Budget must be a positive amount.')
  }
  if (!['total', 'week', 'month'].includes(budget.period)) {
    throw new StintError('invalid-budget', 'Unknown budget period.')
  }
  const resetDay = budget.period === 'month' ? budget.resetDay : 1
  if (!Number.isInteger(resetDay) || resetDay < 1 || resetDay > 28) {
    throw new StintError('invalid-budget', 'Reset day must be between 1 and 28.')
  }
  return {
    budgetMinutes: budget.unit === 'minutes' ? budget.amount : null,
    budgetCents: budget.unit === 'cents' ? budget.amount : null,
    budgetPeriod: budget.period,
    budgetResetDay: resetDay,
  }
}

/** A money budget needs a rate to measure against; call when a budget is set. */
export function assertBudgetHasRate(
  project: BudgetFields & Pick<Project, 'hourlyRateCents'>,
  client: Pick<Client, 'hourlyRateCents' | 'currency'>,
): void {
  if (project.budgetCents !== null && effectiveRate(project, client) === null) {
    throw new StintError(
      'invalid-budget',
      'A money budget needs an hourly rate on the project or client.',
    )
  }
}

/**
 * The time a budget currently covers: null for a fixed (lifetime) budget, the
 * current local week, or the month starting on the reset day.
 */
export function budgetRange(
  budget: Pick<Budget, 'period' | 'resetDay'>,
  now: number,
  zone: string,
  weekStartsOn: WeekStartDay,
): TimeRange | null {
  switch (budget.period) {
    case 'total':
      return null
    case 'week':
      return weekRange(now, zone, weekStartsOn)
    case 'month': {
      const opts = { in: tz(zone) }
      const resetThisMonth = setDate(startOfMonth(now, opts), budget.resetDay, opts)
      const start =
        resetThisMonth.getTime() <= now ? resetThisMonth : addMonths(resetThisMonth, -1, opts)
      return { start: start.getTime(), end: addMonths(start, 1, opts).getTime() }
    }
  }
}

export interface BudgetUsage {
  budget: Budget
  /** Period being measured; null for a fixed budget. */
  range: TimeRange | null
  /** Used so far, in the budget's unit (minutes or cents); null when a money budget has no rate. */
  used: number | null
  /** used / amount (1 = exactly at the cap, above 1 = over); null when there's no rate. */
  fraction: number | null
}

export interface BudgetUsageInput {
  project: Project
  client: Client
  /** Any sessions; only this project's billable, non-deleted ones count. */
  sessions: readonly Session[]
  now: number
  zone: string
  weekStartsOn: WeekStartDay
}

/** How much of a project's budget is used, or null if the project has no budget. */
export function budgetUsage(input: BudgetUsageInput): BudgetUsage | null {
  const { project, client, now } = input
  const budget = projectBudget(project)
  if (!budget) return null
  const range = budgetRange(budget, now, input.zone, input.weekStartsOn)
  const rate = effectiveRate(project, client)
  if (budget.unit === 'cents' && rate === null) return { budget, range, used: null, fraction: null }

  let ms = 0
  let cents = 0
  for (const s of input.sessions) {
    if (s.projectId !== project.id || !s.billable || s.deletedAt !== null) continue
    const duration = clippedDuration(s, range ?? ALL_TIME, now)
    ms += duration
    // Billed sessions keep the rate they were invoiced at.
    if (rate) cents += exactAmountCents(duration, s.billedRateCents ?? rate.cents)
  }
  const used = budget.unit === 'minutes' ? ms / 60_000 : Math.round(cents)
  return { budget, range, used, fraction: used / budget.amount }
}

/**
 * Parse an hours amount someone typed into minutes: "20", "12.5", "12,5", "1:30".
 * Empty → null. Anything else throws.
 */
export function parseHours(text: string): number | null {
  const s = text.trim()
  if (s === '') return null
  const clock = /^(\d+):([0-5]\d)$/.exec(s)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  if (!/^\d+([.,]\d+)?$/.test(s)) {
    throw new StintError('invalid-budget', `"${text}" isn't a number of hours.`)
  }
  return Math.round(Number(s.replace(',', '.')) * 60)
}

/** Minutes → text for an hours input: 750 → "12.5", 1200 → "20". */
export function toHoursInput(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100)
}
