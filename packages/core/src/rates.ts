// SPDX-License-Identifier: GPL-3.0-or-later
import type { Client, Money, Project } from './types'

const MS_PER_HOUR = 3_600_000

/**
 * Hourly rate that applies to a project's time: the project's own rate if set,
 * otherwise the client's. Currency always comes from the client. null = no rate.
 */
export function effectiveRate(
  project: Pick<Project, 'hourlyRateCents'>,
  client: Pick<Client, 'hourlyRateCents' | 'currency'>,
): Money | null {
  const cents = project.hourlyRateCents ?? client.hourlyRateCents
  return cents === null ? null : { currency: client.currency, cents }
}

/**
 * Unrounded amount in cents. Sum these and round once at the end, so totals
 * don't drift from rounding every session separately.
 */
export function exactAmountCents(durationMs: number, hourlyRateCents: number): number {
  return (durationMs * hourlyRateCents) / MS_PER_HOUR
}

export function amountCents(durationMs: number, hourlyRateCents: number): number {
  return Math.round(exactAmountCents(durationMs, hourlyRateCents))
}
