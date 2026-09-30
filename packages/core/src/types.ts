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
  color: string
  hourlyRateCents: number | null
  currency: string
  archived: boolean
}

export interface Project extends SyncFields {
  clientId: string
  name: string
  /** Falls back to the client's color when null. */
  color: string | null
  /** Overrides the client's rate when set. */
  hourlyRateCents: number | null
  /** Default for `billable` on new sessions in this project. */
  billableByDefault: boolean
  archived: boolean
}

export type SessionSource = 'timer' | 'manual' | 'split'

export interface Session extends SyncFields {
  projectId: string
  startedAt: number
  /** null = this is the running timer. */
  endedAt: number | null
  note: string
  billable: boolean
  billingBatchId: string | null
  source: SessionSource
}

export interface BillingBatch extends SyncFields {
  clientId: string
  rangeStart: number
  rangeEnd: number
  reference: string
  billedAt: number
  paidAt: number | null
  note: string
}

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
