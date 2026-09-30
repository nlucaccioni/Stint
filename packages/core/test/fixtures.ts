// SPDX-License-Identifier: GPL-3.0-or-later
import type { ChangeContext } from '../src/changes'
import type { BillingBatch, Client, Project, Session } from '../src/types'

export const MIN = 60_000
export const HOUR = 60 * MIN

/** UTC timestamp: at(2026, 3, 8, 14, 30) = 2026-03-08 14:30Z (month is 1-based). */
export function at(y: number, mo: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h, mi)
}

const sync = { createdAt: 0, updatedAt: 0, deviceId: 'dev-test', deletedAt: null }

export function client(overrides: Partial<Client> = {}): Client {
  return {
    ...sync,
    id: 'c1',
    name: 'Acme',
    color: '#336699',
    hourlyRateCents: 10_000,
    currency: 'USD',
    archived: false,
    ...overrides,
  }
}

export function project(overrides: Partial<Project> = {}): Project {
  return {
    ...sync,
    id: 'p1',
    clientId: 'c1',
    name: 'Website',
    color: null,
    hourlyRateCents: null,
    billableByDefault: true,
    archived: false,
    ...overrides,
  }
}

export function session(overrides: Partial<Session> = {}): Session {
  return {
    ...sync,
    id: 's1',
    projectId: 'p1',
    startedAt: at(2026, 3, 10, 9),
    endedAt: at(2026, 3, 10, 10),
    note: '',
    billable: true,
    billingBatchId: null,
    source: 'timer',
    ...overrides,
  }
}

export function batch(overrides: Partial<BillingBatch> = {}): BillingBatch {
  return {
    ...sync,
    id: 'b1',
    clientId: 'c1',
    rangeStart: at(2026, 3, 1),
    rangeEnd: at(2026, 4, 1),
    reference: 'INV-001',
    billedAt: at(2026, 4, 1),
    paidAt: null,
    note: '',
    ...overrides,
  }
}

/** Context with a fixed clock and predictable IDs: new-1, new-2, … */
export function ctx(now: number): ChangeContext {
  let n = 0
  return { now, deviceId: 'dev-A', newId: () => `new-${++n}` }
}
