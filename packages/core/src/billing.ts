// SPDX-License-Identifier: GPL-3.0-or-later
// Billing status is always derived, never stored (SPEC.md §5).
import type { BillingBatch, BillingStatus, Session } from './types'

export function billingStatus(
  session: Pick<Session, 'billingBatchId'>,
  batches: ReadonlyMap<string, Pick<BillingBatch, 'paidAt'>>,
): BillingStatus {
  if (session.billingBatchId === null) return 'unbilled'
  // A missing batch shouldn't happen; treat the session as billed so it stays locked.
  return batches.get(session.billingBatchId)?.paidAt != null ? 'paid' : 'billed'
}

/** Sessions in a billing batch are read-only until explicitly unlocked. */
export function isLocked(session: Pick<Session, 'billingBatchId'>): boolean {
  return session.billingBatchId !== null
}
