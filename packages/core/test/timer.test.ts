// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { resolveIdle, start, stop, stopAt, toggle } from '../src/timer'
import { HOUR, MIN, at, ctx, project, session } from './fixtures'

const now = at(2026, 3, 10, 12)
const p1 = project({ id: 'p1' })
const p2 = project({ id: 'p2', billableByDefault: false })
const running = session({ id: 'run', projectId: 'p1', startedAt: now - HOUR, endedAt: null })

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return (e as { code?: string }).code
  }
  return undefined
}

describe('start', () => {
  it('starts a new running session when idle', () => {
    expect(start(null, p1, ctx(now))).toEqual([
      {
        kind: 'insert',
        session: {
          id: 'new-1',
          projectId: 'p1',
          startedAt: now,
          endedAt: null,
          note: '',
          billable: true,
          billingBatchId: null,
          billedRateCents: null,
          source: 'timer',
          createdAt: now,
          updatedAt: now,
          deviceId: 'dev-A',
          deletedAt: null,
        },
      },
    ])
  })

  it('switches projects at the same instant', () => {
    const changes = start(running, p2, ctx(now))
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({ kind: 'update', id: 'run', patch: { endedAt: now } })
    expect(changes[1]).toMatchObject({
      kind: 'insert',
      session: { projectId: 'p2', startedAt: now },
    })
  })

  it("uses the project's billable default", () => {
    expect(start(null, p2, ctx(now))[0]).toMatchObject({ session: { billable: false } })
  })

  it('does nothing if the project is already running', () => {
    expect(start(running, p1, ctx(now))).toEqual([])
  })
})

describe('toggle', () => {
  it('stops the running project', () => {
    expect(toggle(running, p1, ctx(now))).toEqual([
      { kind: 'update', id: 'run', patch: { endedAt: now, updatedAt: now, deviceId: 'dev-A' } },
    ])
  })

  it('switches to a different project', () => {
    expect(toggle(running, p2, ctx(now)).map((c) => c.kind)).toEqual(['update', 'insert'])
  })

  it('starts when nothing is running', () => {
    expect(toggle(null, p1, ctx(now)).map((c) => c.kind)).toEqual(['insert'])
  })
})

describe('stop', () => {
  it('ends the running session now', () => {
    expect(stop(running, ctx(now))).toMatchObject([{ id: 'run', patch: { endedAt: now } }])
  })

  it('does nothing when idle', () => {
    expect(stop(null, ctx(now))).toEqual([])
  })

  it('deletes a timer stopped in the same instant it started', () => {
    const justStarted = { ...running, startedAt: now }
    expect(stop(justStarted, ctx(now))).toMatchObject([{ id: 'run', patch: { deletedAt: now } }])
  })

  it('deletes rather than saving a negative duration if the clock went backwards', () => {
    const future = { ...running, startedAt: now + 5_000 }
    expect(stop(future, ctx(now))).toMatchObject([{ patch: { deletedAt: now } }])
  })

  it('switching in the same instant replaces the empty session', () => {
    const justStarted = { ...running, startedAt: now }
    const changes = start(justStarted, p2, ctx(now))
    expect(changes[0]).toMatchObject({ patch: { deletedAt: now } })
    expect(changes[1]).toMatchObject({ kind: 'insert', session: { projectId: 'p2' } })
  })
})

describe('stopAt', () => {
  it('ends the running session at an earlier time', () => {
    expect(stopAt(running, now - 10 * MIN, ctx(now))).toMatchObject([
      { patch: { endedAt: now - 10 * MIN } },
    ])
  })

  it('accepts now', () => {
    expect(() => stopAt(running, now, ctx(now))).not.toThrow()
  })

  it('rejects times outside start..now', () => {
    expect(code(() => stopAt(running, running.startedAt, ctx(now)))).toBe('stop-out-of-range')
    expect(code(() => stopAt(running, now + 1, ctx(now)))).toBe('stop-out-of-range')
  })

  it('requires a running timer', () => {
    expect(code(() => stopAt(null, now, ctx(now)))).toBe('not-running')
  })
})

describe('resolveIdle', () => {
  const idleAt = now - 20 * MIN

  it('keep: changes nothing', () => {
    expect(resolveIdle(running, idleAt, 'keep', ctx(now))).toEqual([])
  })

  it('discard: ends the session when idle began', () => {
    expect(resolveIdle(running, idleAt, 'discard', ctx(now))).toMatchObject([
      { kind: 'update', id: 'run', patch: { endedAt: idleAt } },
    ])
  })

  it('discard-continue: ends at idle start and starts fresh now on the same project', () => {
    const changes = resolveIdle(
      { ...running, billable: false },
      idleAt,
      'discard-continue',
      ctx(now),
    )
    expect(changes[0]).toMatchObject({ patch: { endedAt: idleAt } })
    expect(changes[1]).toMatchObject({
      kind: 'insert',
      session: { projectId: 'p1', startedAt: now, endedAt: null, billable: false },
    })
  })

  it('deletes the session if all of it was idle', () => {
    expect(resolveIdle(running, running.startedAt - MIN, 'discard', ctx(now))).toMatchObject([
      { id: 'run', patch: { deletedAt: now } },
    ])
  })

  it('does nothing when no timer is running', () => {
    expect(resolveIdle(null, idleAt, 'discard', ctx(now))).toEqual([])
  })
})
