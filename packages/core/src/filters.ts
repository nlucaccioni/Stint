// SPDX-License-Identifier: GPL-3.0-or-later
// The Time tab's filters (SPEC.md §6 "Time tab"): which client or project, and
// which billing state.
import { billingStatus } from './billing'
import type { BillingBatch, Project, Session } from './types'

export type ScopeFilter =
  | { kind: 'all' }
  | { kind: 'client'; id: string }
  | { kind: 'project'; id: string }

export type BillingFilter = 'all' | 'billable' | 'nonBillable' | 'unbilled' | 'billed' | 'paid'

export interface SessionFilter {
  scope: ScopeFilter
  billing: BillingFilter
}

export const NO_FILTER: SessionFilter = { scope: { kind: 'all' }, billing: 'all' }

export function filterSessions(
  sessions: readonly Session[],
  filter: SessionFilter,
  projects: readonly Pick<Project, 'id' | 'clientId'>[],
  batches: ReadonlyMap<string, Pick<BillingBatch, 'paidAt'>>,
): Session[] {
  const { scope, billing } = filter
  const clientOf = new Map(projects.map((p) => [p.id, p.clientId]))
  return sessions.filter((s) => {
    if (scope.kind === 'project' && s.projectId !== scope.id) return false
    if (scope.kind === 'client' && clientOf.get(s.projectId) !== scope.id) return false
    switch (billing) {
      case 'all':
        return true
      case 'billable':
        return s.billable
      case 'nonBillable':
        return !s.billable
      default:
        return billingStatus(s, batches) === billing
    }
  })
}
