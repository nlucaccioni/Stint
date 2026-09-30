// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  createManualSession,
  deleteSession,
  editSession,
  findOverlaps,
  splitSession,
  validateTimes,
} from '../src/sessions'
import { HOUR, at, ctx, session } from './fixtures'

const now = at(2026, 3, 10, 18)

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return (e as { code?: string }).code
  }
  return undefined
}

describe('validateTimes', () => {
  it('accepts a valid range', () => {
    expect(() => validateTimes(at(2026, 3, 10, 9), at(2026, 3, 10, 10), now)).not.toThrow()
  })

  it('rejects end at or before start', () => {
    expect(code(() => validateTimes(10, 10, now))).toBe('end-before-start')
    expect(code(() => validateTimes(10, 5, now))).toBe('end-before-start')
  })

  it('rejects future times', () => {
    expect(code(() => validateTimes(now + 1, null, now))).toBe('in-future')
    expect(code(() => validateTimes(now - HOUR, now + 1, now))).toBe('in-future')
  })
})

describe('findOverlaps', () => {
  const others = [
    session({ id: 'a', startedAt: at(2026, 3, 10, 9), endedAt: at(2026, 3, 10, 10) }),
    session({ id: 'b', startedAt: at(2026, 3, 10, 10), endedAt: at(2026, 3, 10, 11) }),
    session({
      id: 'gone',
      startedAt: at(2026, 3, 10, 9),
      endedAt: at(2026, 3, 10, 12),
      deletedAt: 1,
    }),
    session({ id: 'run', startedAt: at(2026, 3, 10, 17), endedAt: null }),
  ]

  it('finds sessions sharing time, ignoring deleted ones', () => {
    const hits = findOverlaps(
      { startedAt: at(2026, 3, 10, 9, 30), endedAt: at(2026, 3, 10, 10, 30) },
      others,
      now,
    )
    expect(hits.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('does not count touching sessions', () => {
    const hits = findOverlaps(
      { startedAt: at(2026, 3, 10, 11), endedAt: at(2026, 3, 10, 12) },
      others,
      now,
    )
    expect(hits).toEqual([])
  })

  it('excludes the session being edited', () => {
    const hits = findOverlaps(
      { id: 'a', startedAt: at(2026, 3, 10, 9), endedAt: at(2026, 3, 10, 9, 30) },
      others,
      now,
    )
    expect(hits).toEqual([])
  })

  it('treats a running session as lasting until now', () => {
    const hits = findOverlaps(
      { startedAt: at(2026, 3, 10, 17, 30), endedAt: at(2026, 3, 10, 17, 45) },
      others,
      now,
    )
    expect(hits.map((s) => s.id)).toEqual(['run'])
  })
})

describe('editSession', () => {
  it('moves a session to another project and stamps the change', () => {
    expect(editSession(session(), { projectId: 'p2' }, ctx(now))).toEqual({
      kind: 'update',
      id: 's1',
      patch: { projectId: 'p2', updatedAt: now, deviceId: 'dev-A' },
    })
  })

  it('changes times', () => {
    const change = editSession(session(), { startedAt: at(2026, 3, 10, 8) }, ctx(now))
    expect(change).toMatchObject({ patch: { startedAt: at(2026, 3, 10, 8) } })
  })

  it('validates against the existing other end', () => {
    expect(code(() => editSession(session(), { startedAt: at(2026, 3, 10, 11) }, ctx(now)))).toBe(
      'end-before-start',
    )
  })

  it('allows changing the start of a running session', () => {
    const running = session({ endedAt: null })
    expect(() => editSession(running, { startedAt: at(2026, 3, 10, 8) }, ctx(now))).not.toThrow()
  })

  it('refuses to set the end of a running session', () => {
    const running = session({ endedAt: null })
    expect(code(() => editSession(running, { endedAt: at(2026, 3, 10, 12) }, ctx(now)))).toBe(
      'session-running',
    )
  })

  it('refuses billed sessions', () => {
    expect(
      code(() => editSession(session({ billingBatchId: 'b1' }), { note: 'x' }, ctx(now))),
    ).toBe('session-locked')
  })

  it('refuses deleted sessions', () => {
    expect(code(() => editSession(session({ deletedAt: 1 }), { note: 'x' }, ctx(now)))).toBe(
      'session-deleted',
    )
  })
})

describe('createManualSession', () => {
  it('inserts a manual session with sync fields', () => {
    const change = createManualSession(
      {
        projectId: 'p1',
        startedAt: at(2026, 3, 9, 9),
        endedAt: at(2026, 3, 9, 12),
        billable: false,
      },
      ctx(now),
    )
    expect(change).toEqual({
      kind: 'insert',
      session: {
        id: 'new-1',
        projectId: 'p1',
        startedAt: at(2026, 3, 9, 9),
        endedAt: at(2026, 3, 9, 12),
        note: '',
        billable: false,
        billingBatchId: null,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
        deviceId: 'dev-A',
        deletedAt: null,
      },
    })
  })

  it('validates times', () => {
    expect(
      code(() =>
        createManualSession(
          { projectId: 'p1', startedAt: 10, endedAt: 5, billable: true },
          ctx(now),
        ),
      ),
    ).toBe('end-before-start')
  })
})

describe('splitSession', () => {
  const mid = at(2026, 3, 10, 9, 30)

  it('splits a finished session into two', () => {
    const s = session({ note: 'design', billable: false })
    const [first, second] = splitSession(s, mid, ctx(now))
    expect(first).toEqual({
      kind: 'update',
      id: 's1',
      patch: { endedAt: mid, updatedAt: now, deviceId: 'dev-A' },
    })
    expect(second).toMatchObject({
      kind: 'insert',
      session: {
        projectId: 'p1',
        startedAt: mid,
        endedAt: s.endedAt,
        note: 'design',
        billable: false,
        source: 'split',
      },
    })
  })

  it('keeps the second half running when splitting a running session', () => {
    const [, second] = splitSession(session({ endedAt: null }), mid, ctx(now))
    expect(second).toMatchObject({ session: { startedAt: mid, endedAt: null } })
  })

  it('rejects split points outside the session', () => {
    const s = session()
    expect(code(() => splitSession(s, s.startedAt, ctx(now)))).toBe('split-out-of-range')
    expect(code(() => splitSession(s, s.endedAt!, ctx(now)))).toBe('split-out-of-range')
    expect(code(() => splitSession(session({ endedAt: null }), now, ctx(now)))).toBe(
      'split-out-of-range',
    )
  })

  it('refuses billed sessions', () => {
    expect(code(() => splitSession(session({ billingBatchId: 'b1' }), mid, ctx(now)))).toBe(
      'session-locked',
    )
  })
})

describe('deleteSession', () => {
  it('soft deletes', () => {
    expect(deleteSession(session(), ctx(now))).toMatchObject({
      kind: 'update',
      id: 's1',
      patch: { deletedAt: now },
    })
  })

  it('refuses billed sessions', () => {
    expect(code(() => deleteSession(session({ billingBatchId: 'b1' }), ctx(now)))).toBe(
      'session-locked',
    )
  })
})
