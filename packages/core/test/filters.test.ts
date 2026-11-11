// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { filterSessions, NO_FILTER, type SessionFilter } from '../src/filters'
import { project, session } from './fixtures'

const projects = [project({ id: 'p1', clientId: 'c1' }), project({ id: 'p2', clientId: 'c2' })]
const batches = new Map([
  ['unpaid', { paidAt: null }],
  ['paid', { paidAt: 5 }],
])
const sessions = [
  session({ id: 'billable' }),
  session({ id: 'non', billable: false }),
  session({ id: 'billed', billingBatchId: 'unpaid' }),
  session({ id: 'paid', projectId: 'p2', billingBatchId: 'paid' }),
]
const ids = (filter: Partial<SessionFilter>) =>
  filterSessions(sessions, { ...NO_FILTER, ...filter }, projects, batches).map((s) => s.id)

describe('filterSessions', () => {
  it('keeps everything with no filter', () => {
    expect(ids({})).toEqual(['billable', 'non', 'billed', 'paid'])
  })

  it('filters by client or project', () => {
    expect(ids({ scope: { kind: 'client', id: 'c2' } })).toEqual(['paid'])
    expect(ids({ scope: { kind: 'project', id: 'p1' } })).toEqual(['billable', 'non', 'billed'])
  })

  it('filters by billing state', () => {
    expect(ids({ billing: 'billable' })).toEqual(['billable', 'billed', 'paid'])
    expect(ids({ billing: 'nonBillable' })).toEqual(['non'])
    expect(ids({ billing: 'unbilled' })).toEqual(['billable', 'non'])
    expect(ids({ billing: 'billed' })).toEqual(['billed'])
    expect(ids({ billing: 'paid' })).toEqual(['paid'])
  })
})
