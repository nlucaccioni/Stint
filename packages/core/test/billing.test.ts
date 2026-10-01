// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  addToBatch,
  batchCandidates,
  billingSummary,
  createBatch,
  daysWaiting,
  editBatch,
  roundDuration,
  unbilledByClient,
  unbillBatch,
  unlockSession,
} from '../src/billing'
import { computeTotals } from '../src/totals'
import { HOUR, MIN, at, batch, client, ctx, project, session } from './fixtures'

const now = at(2026, 3, 31, 12)
const off = { minutes: 0, mode: 'up' as const }
const acme = client({ id: 'c1', hourlyRateCents: 10_000, currency: 'USD' })
const other = client({ id: 'c2', name: 'Other' })
const projects = [
  project({ id: 'p1', clientId: 'c1' }),
  project({ id: 'p2', clientId: 'c1', hourlyRateCents: 15_000 }),
  project({ id: 'p9', clientId: 'c2' }),
]
const s = (id: string, day: number, hours: number, extra = {}) =>
  session({
    id,
    projectId: 'p1',
    startedAt: at(2026, 3, day, 9),
    endedAt: at(2026, 3, day, 9) + hours * HOUR,
    ...extra,
  })

const sessions = [
  s('a', 2, 1),
  s('b', 10, 2, { projectId: 'p2' }),
  s('nonbill', 11, 1, { billable: false }),
  s('billed', 12, 1, { billingBatchId: 'old' }),
  s('running', 30, 0, { endedAt: null }),
  s('gone', 13, 1, { deletedAt: 1 }),
  s('otherclient', 14, 1, { projectId: 'p9' }),
  s('april', 40, 1), // starts Apr 9
]

describe('roundDuration', () => {
  it('is off at 0', () => {
    expect(roundDuration(61 * MIN, off)).toBe(61 * MIN)
  })

  it('rounds each session up or to the nearest step', () => {
    expect(roundDuration(61 * MIN, { minutes: 15, mode: 'up' })).toBe(75 * MIN)
    expect(roundDuration(61 * MIN, { minutes: 15, mode: 'nearest' })).toBe(60 * MIN)
    expect(roundDuration(68 * MIN, { minutes: 15, mode: 'nearest' })).toBe(75 * MIN)
    expect(roundDuration(1, { minutes: 6, mode: 'up' })).toBe(6 * MIN)
  })
})

describe('batchCandidates', () => {
  it('takes unbilled, billable, finished sessions of the client that started in range', () => {
    const march = { start: at(2026, 3, 1), end: at(2026, 4, 1) }
    expect(batchCandidates(sessions, projects, 'c1', march).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('includes a session that started in range even if it ends after', () => {
    const overnight = s('late', 31, 5, {
      startedAt: at(2026, 3, 31, 22),
      endedAt: at(2026, 4, 1, 3),
    })
    const march = { start: at(2026, 3, 1), end: at(2026, 4, 1) }
    expect(batchCandidates([overnight], projects, 'c1', march)).toHaveLength(1)
  })
})

describe('billingSummary', () => {
  it('uses current rates for unbilled sessions and recorded rates for billed ones', () => {
    const recorded = s('r', 3, 1, { billingBatchId: 'x', billedRateCents: 5_000 })
    const sum = billingSummary([s('a', 2, 1), recorded], projects, acme, off, now)
    expect(sum).toEqual({
      count: 2,
      ms: 2 * HOUR,
      billedMs: 2 * HOUR,
      amount: { currency: 'USD', cents: 15_000 },
    })
  })

  it('applies rounding per session to billed time and amount, not actual time', () => {
    const short = [
      s('x', 2, 0, { endedAt: at(2026, 3, 2, 9, 7) }),
      s('y', 3, 0, { endedAt: at(2026, 3, 3, 9, 7) }),
    ]
    const sum = billingSummary(short, projects, acme, { minutes: 15, mode: 'up' }, now)
    expect(sum.ms).toBe(14 * MIN)
    expect(sum.billedMs).toBe(30 * MIN)
    expect(sum.amount).toEqual({ currency: 'USD', cents: 5_000 })
  })

  it('has no amount when nothing has a rate', () => {
    expect(
      billingSummary([s('a', 2, 1)], projects, client({ hourlyRateCents: null }), off, now).amount,
    ).toBeNull()
  })
})

describe('unbilledByClient', () => {
  it('summarizes billable unbilled time per client with the oldest date', () => {
    const rows = unbilledByClient(sessions, projects, [acme, other], off, now)
    expect(rows.map((r) => [r.clientId, r.count, r.billedMs / HOUR])).toEqual([
      ['c1', 3, 4], // a, b, april
      ['c2', 1, 1],
    ])
    expect(rows[0]!.oldestStartedAt).toBe(at(2026, 3, 2, 9))
  })
})

describe('createBatch', () => {
  const input = {
    clientId: 'c1',
    range: { start: at(2026, 3, 1), end: at(2026, 4, 1) },
    sessionIds: ['a', 'b'],
    reference: '  INV-042 ',
    billedAt: at(2026, 4, 1, 16),
    note: '',
  }
  const context = {
    sessions,
    projects,
    client: acme,
    rounding: { minutes: 6, mode: 'up' as const },
  }

  it('creates the batch and locks each session with its current rate', () => {
    const { batch: b, sessions: changes } = createBatch(input, context, ctx(now))
    expect(b).toMatchObject({
      id: 'new-1',
      clientId: 'c1',
      reference: 'INV-042',
      paidAt: null,
      roundingMinutes: 6,
      roundingMode: 'up',
    })
    expect(changes).toEqual([
      {
        kind: 'update',
        id: 'a',
        patch: {
          billingBatchId: 'new-1',
          billedRateCents: 10_000,
          updatedAt: now,
          deviceId: 'dev-A',
        },
      },
      {
        kind: 'update',
        id: 'b',
        patch: {
          billingBatchId: 'new-1',
          billedRateCents: 15_000,
          updatedAt: now,
          deviceId: 'dev-A',
        },
      },
    ])
  })

  it('refuses an empty batch or ineligible sessions', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return (e as { code: string }).code
      }
    }
    expect(code(() => createBatch({ ...input, sessionIds: [] }, context, ctx(now)))).toBe(
      'batch-empty',
    )
    for (const id of ['billed', 'nonbill', 'running', 'gone', 'otherclient']) {
      expect(code(() => createBatch({ ...input, sessionIds: [id] }, context, ctx(now)))).toBe(
        'not-eligible',
      )
    }
  })
})

describe('changing batches', () => {
  const unpaid = batch({ id: 'B', clientId: 'c1' })
  const paid = batch({ id: 'B', clientId: 'c1', paidAt: at(2026, 4, 10) })
  const inBatch = [
    s('a', 2, 1, { billingBatchId: 'B', billedRateCents: 10_000 }),
    s('z', 3, 1, { billingBatchId: 'B', billedRateCents: 10_000 }),
  ]

  it('adds sessions to an unpaid batch only', () => {
    const context = { sessions, projects, client: acme }
    expect(addToBatch(unpaid, ['b'], context, ctx(now))).toMatchObject([
      { id: 'b', patch: { billingBatchId: 'B' } },
    ])
    expect(() => addToBatch(paid, ['b'], context, ctx(now))).toThrow(/unpaid/)
  })

  it('unlocks one session', () => {
    expect(unlockSession(inBatch[0]!, ctx(now))).toMatchObject({
      id: 'a',
      patch: { billingBatchId: null, billedRateCents: null },
    })
    expect(() => unlockSession(s('a', 2, 1), ctx(now))).toThrow(/isn’t billed/)
  })

  it('un-bills a whole unpaid batch, and refuses a paid one', () => {
    const result = unbillBatch(unpaid, inBatch, ctx(now))
    expect(result.batch.deletedAt).toBe(now)
    expect(result.sessions.map((c) => c.kind === 'update' && c.patch.billingBatchId)).toEqual([
      null,
      null,
    ])
    expect(() => unbillBatch(paid, inBatch, ctx(now))).toThrow(/unpaid/)
  })

  it('marks paid and unpaid, and edits details', () => {
    expect(editBatch(unpaid, { paidAt: at(2026, 4, 15) }, ctx(now)).paidAt).toBe(at(2026, 4, 15))
    expect(editBatch(paid, { paidAt: null }, ctx(now)).paidAt).toBeNull()
    expect(editBatch(unpaid, { reference: ' INV-9 ', note: 'net 30' }, ctx(now))).toMatchObject({
      reference: 'INV-9',
      note: 'net 30',
      updatedAt: now,
    })
  })

  it('counts days waiting since billing', () => {
    expect(daysWaiting({ billedAt: at(2026, 4, 1, 12) }, at(2026, 4, 1, 18))).toBe(0)
    expect(daysWaiting({ billedAt: at(2026, 4, 1, 12) }, at(2026, 4, 11, 13))).toBe(10)
  })
})

describe('totals with billed sessions', () => {
  it('keep the recorded rate when the current rate changes', () => {
    const billed = s('a', 2, 1, { billingBatchId: 'B', billedRateCents: 10_000 })
    const raised = client({ id: 'c1', hourlyRateCents: 20_000 })
    const t = computeTotals({
      sessions: [billed],
      projects,
      clients: [raised],
      range: { start: 0, end: now },
      now,
    })
    expect(t.amounts).toEqual([{ currency: 'USD', cents: 10_000 }])
  })
})
