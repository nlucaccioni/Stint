// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '@stint/core'
import type { IdleAway } from '../shared/api'
import { createApiHandlers, type ApiHandlers } from './api'
import { openDatabase } from './db/connection'

const MIN = 60_000
const T0 = Date.UTC(2026, 2, 10, 9)
let clock: number
let pending: IdleAway | null
let api: ApiHandlers
let project: Project

beforeEach(() => {
  clock = T0
  pending = null
  api = createApiHandlers({
    db: openDatabase(':memory:'),
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => clock,
    pendingIdle: { get: () => pending, clear: () => (pending = null) },
  })
  const client = api.createClient({
    name: 'A',
    color: '#000000',
    hourlyRateCents: null,
    currency: 'USD',
  })
  project = api.createProject({
    clientId: client.id,
    name: 'P',
    color: null,
    hourlyRateCents: null,
    billableByDefault: true,
  })
})

/** Start a timer at T0, then pretend the user was away 20:00–40:00 and is back at 41:00. */
function awayWhileRunning() {
  const running = api.startTimer(project.id).running!
  pending = { sessionId: running.id, idleStartedAt: T0 + 20 * MIN, returnedAt: T0 + 41 * MIN }
  clock = T0 + 41 * MIN
  return running
}

const all = () => api.listSessions({ start: 0, end: T0 + 60 * MIN })

describe('resolveIdle', () => {
  it('exposes the pending absence', () => {
    awayWhileRunning()
    expect(api.getPendingIdle()).toEqual(pending)
  })

  it('keep: the timer carries on untouched', () => {
    const running = awayWhileRunning()
    expect(api.resolveIdle('keep').running).toEqual(running)
    expect(api.getPendingIdle()).toBeNull()
  })

  it('discard: the session ends when the user went away', () => {
    awayWhileRunning()
    expect(api.resolveIdle('discard').running).toBeNull()
    expect(all().map((s) => [s.startedAt, s.endedAt])).toEqual([[T0, T0 + 20 * MIN]])
  })

  it('discard and continue: ends at idle start and starts fresh now', () => {
    awayWhileRunning()
    const state = api.resolveIdle('discard-continue')
    expect(state.running).toMatchObject({ projectId: project.id, startedAt: T0 + 41 * MIN })
    expect(all().map((s) => [s.startedAt, s.endedAt])).toEqual([
      [T0, T0 + 20 * MIN],
      [T0 + 41 * MIN, null],
    ])
  })

  it('does nothing if a different session is running now', () => {
    awayWhileRunning()
    api.stopTimer()
    clock += MIN
    const other = api.startTimer(project.id).running!
    expect(api.resolveIdle('discard').running).toEqual(other)
    expect(api.getPendingIdle()).toBeNull()
  })

  it('does nothing with no pending absence', () => {
    expect(api.resolveIdle('discard')).toEqual({ running: null })
  })
})
