// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { budgetFields } from '../src/budget'
import { StintError } from '../src/errors'
import { deleteProjectSessions } from '../src/sessions'
import { projectSummaries } from '../src/summary'
import { HOUR, at, client, ctx, project, session } from './fixtures'

const now = at(2026, 3, 18, 15)
const base = { clients: [client()], now, zone: 'America/New_York', weekStartsOn: 1 as const }

describe('projectSummaries', () => {
  it('splits unbilled billable time from everything recorded', () => {
    const summaries = projectSummaries({
      ...base,
      projects: [project(), project({ id: 'empty' })],
      sessions: [
        session({ id: '1', startedAt: at(2026, 3, 1, 9), endedAt: at(2026, 3, 1, 11) }),
        session({
          id: '2',
          billable: false,
          startedAt: at(2026, 3, 2, 9),
          endedAt: at(2026, 3, 2, 10),
        }),
        session({
          id: '3',
          billingBatchId: 'b1',
          startedAt: at(2026, 2, 2, 9),
          endedAt: at(2026, 2, 2, 13),
        }),
        session({ id: '4', startedAt: at(2026, 3, 18, 14), endedAt: null }), // running, 1h so far
        session({
          id: '5',
          deletedAt: 1,
          startedAt: at(2026, 3, 3, 9),
          endedAt: at(2026, 3, 3, 12),
        }),
      ],
    })
    expect(summaries.get('p1')).toMatchObject({
      unbilledMs: 3 * HOUR,
      recordedMs: 8 * HOUR,
      sessionCount: 4,
      hasBilledTime: true,
      budget: null,
    })
    expect(summaries.get('empty')).toMatchObject({
      unbilledMs: 0,
      recordedMs: 0,
      sessionCount: 0,
      hasBilledTime: false,
    })
  })

  it('includes budget usage', () => {
    const p = project(budgetFields({ unit: 'minutes', amount: 600, period: 'total', resetDay: 1 }))
    const summaries = projectSummaries({ ...base, projects: [p], sessions: [session()] })
    expect(summaries.get('p1')?.budget?.fraction).toBe(0.1)
  })
})

describe('deleteProjectSessions', () => {
  const sessions = [
    session({ id: '1' }),
    session({ id: '2', projectId: 'other' }),
    session({ id: '3', deletedAt: 5 }),
  ]

  it('soft-deletes the live sessions of the given projects', () => {
    const changes = deleteProjectSessions(sessions, new Set(['p1']), 'project', ctx(now))
    expect(changes).toEqual([
      { kind: 'update', id: '1', patch: expect.objectContaining({ deletedAt: now }) },
    ])
  })

  it('refuses when any of them is billed', () => {
    const billed = [...sessions, session({ id: '4', billingBatchId: 'b1' })]
    try {
      deleteProjectSessions(billed, new Set(['p1']), 'client', ctx(now))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(StintError)
      expect((e as StintError).code).toBe('has-billed-time')
      expect((e as StintError).message).toContain('client')
    }
  })
})
