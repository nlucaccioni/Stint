// SPDX-License-Identifier: GPL-3.0-or-later
import { formatMoney, type Money, type Rounding, type RoundingScope } from '@stint/core'

/** "Mar 10, 2026" in the user's language and zone. */
export function formatDay(ms: number, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: zone,
  }).format(ms)
}

export function amountLabel(amount: Money | null): string {
  return amount ? formatMoney(amount.cents, amount.currency) : '—'
}

const SCOPE_PHRASE: Record<RoundingScope, string> = {
  project: 'per project',
  day: 'per project per day',
  session: 'per session',
}

/** "rounded up to 15 min per project" */
export function roundingLabel(rounding: Rounding): string {
  return `rounded ${rounding.mode} to ${rounding.minutes} min ${SCOPE_PHRASE[rounding.scope]}`
}
