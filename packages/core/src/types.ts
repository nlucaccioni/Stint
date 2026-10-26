// SPDX-License-Identifier: GPL-3.0-or-later
// Data model (SPEC.md §5). Timestamps are integer UTC epoch milliseconds;
// money is integer cents; currency is an ISO 4217 code.

/** Fields every synced record carries. */
export interface SyncFields {
  id: string
  createdAt: number
  updatedAt: number
  /** Device that last modified the record. */
  deviceId: string
  /** Soft delete: set instead of removing the row. */
  deletedAt: number | null
}

export interface Client extends SyncFields {
  name: string
  /** Position in the user's order (see order.ts). */
  sortKey: string
  color: string
  hourlyRateCents: number | null
  currency: string
  archived: boolean
}

/** Projects have no color of their own; they use their client's. */
export interface Project extends SyncFields {
  clientId: string
  name: string
  /** Position among its client's projects (see order.ts). */
  sortKey: string
  /** Overrides the client's rate when set. */
  hourlyRateCents: number | null
  /** Default for `billable` on new sessions in this project. */
  billableByDefault: boolean
  archived: boolean
  /** Hours budget, in minutes. At most one of budgetMinutes/budgetCents is set. */
  budgetMinutes: number | null
  /** Money budget, in the client's currency. */
  budgetCents: number | null
  budgetPeriod: BudgetPeriod
  /** Day of the month (1–28) a monthly budget resets. */
  budgetResetDay: number
}

/** `total` = a fixed cap for the life of the project; `week`/`month` = a rolling cap. */
export type BudgetPeriod = 'total' | 'week' | 'month'

export type SessionSource = 'timer' | 'manual' | 'split'

export interface Session extends SyncFields {
  projectId: string
  startedAt: number
  /** null = this is the running timer. */
  endedAt: number | null
  note: string
  billable: boolean
  billingBatchId: string | null
  /**
   * The hourly rate when the session was billed (null while unbilled). Recorded so
   * a later rate change never alters an invoice that was already sent.
   */
  billedRateCents: number | null
  source: SessionSource
}

export interface BillingBatch extends SyncFields {
  clientId: string
  rangeStart: number
  rangeEnd: number
  /** Where it was invoiced: "INV-042", "Bonsai", "PDF"… */
  reference: string
  billedAt: number
  paidAt: number | null
  note: string
  /** Billing rounding in effect when the batch was created (0 = none). */
  roundingMinutes: number
  roundingMode: RoundingMode
}

export type RoundingMode = 'up' | 'nearest'

export type BillingStatus = 'unbilled' | 'billed' | 'paid'

export interface Money {
  currency: string
  cents: number
}

/** Half-open time range: includes `start`, excludes `end`. */
export interface TimeRange {
  start: number
  end: number
}
