// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '@stint/core'
import type { TimerState } from '../shared/api'
import { createApiHandlers, type ApiHandlers } from './api'
import { openDatabase, type Db } from './db/connection'
import { toResult } from './result'

const HOUR = 3_600_000
const MIN = 60_000
const NOW = Date.UTC(2026, 2, 10, 18)

let api: ApiHandlers
let db: Db
let events: { timer: TimerState[]; sessions: number }
let a: Project
let b: Project

beforeEach(() => {
  db = openDatabase(':memory:')
  events = { timer: [], sessions: 0 }
  api = createApiHandlers({
    db,
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => NOW,
    onTimerChanged: (s) => events.timer.push(s),
    onSessionsChanged: () => events.sessions++,
  })
  const client = api.createClient({
    name: 'Acme',
    color: '#336699',
    hourlyRateCents: 10_000,
    currency: 'USD',
  })
  const fields = {
    clientId: client.id,
    color: null,
    hourlyRateCents: null,
    billableByDefault: true,
  }
  a = api.createProject({ ...fields, name: 'A' })
  b = api.createProject({ ...fields, name: 'B' })
})

const entry = (startH: number, endH: number, projectId = () => a.id) => ({
  projectId: projectId(),
  startedAt: NOW - startH * HOUR,
  endedAt: NOW - endH * HOUR,
  note: '',
  billable: true,
})

describe('manual entries and listing', () => {
  it('creates a manual session and lists it by range', () => {
    const s = api.createSession({ ...entry(3, 2), note: 'Kickoff call' })
    expect(s).toMatchObject({ source: 'manual', note: 'Kickoff call', endedAt: NOW - 2 * HOUR })
    expect(api.listSessions({ start: NOW - 4 * HOUR, end: NOW })).toEqual([s])
    expect(api.listSessions({ start: NOW - HOUR, end: NOW })).toEqual([])
  })

  it('notifies sessionsChanged but not timerChanged for non-running edits', () => {
    api.createSession(entry(3, 2))
    expect(events).toEqual({ timer: [], sessions: 1 })
  })

  it('rejects invalid times with a rule code', () => {
    expect(toResult(() => api.createSession(entry(2, 3)))).toMatchObject({
      error: { code: 'end-before-start' },
    })
  })
})

describe('editing', () => {
  it('changes times and moves to another project', () => {
    const s = api.createSession(entry(3, 2))
    const edited = api.updateSession(s.id, { startedAt: NOW - 4 * HOUR, projectId: b.id })
    expect(edited).toMatchObject({ startedAt: NOW - 4 * HOUR, projectId: b.id, endedAt: s.endedAt })
  })

  it('refuses to move time onto an archived project', () => {
    const s = api.createSession(entry(3, 2))
    api.updateProject(b.id, { archived: true })
    expect(toResult(() => api.updateSession(s.id, { projectId: b.id }))).toMatchObject({
      error: { code: 'archived' },
    })
  })

  it('editing the running session also notifies timerChanged', () => {
    api.startTimer(a.id)
    events.timer = []
    const running = api.getTimerState().running!
    api.updateSession(running.id, { startedAt: NOW - 30 * MIN })
    expect(events.timer).toHaveLength(1)
    expect(events.timer[0]!.running!.startedAt).toBe(NOW - 30 * MIN)
  })

  it('refuses billed (locked) sessions', () => {
    const s = api.createSession(entry(3, 2))
    db.prepare('UPDATE sessions SET billing_batch_id = ? WHERE id = ?').run('batch-1', s.id)
    expect(toResult(() => api.updateSession(s.id, { note: 'x' }))).toMatchObject({
      error: { code: 'session-locked' },
    })
  })
})

describe('overlaps', () => {
  it('finds other sessions sharing time, excluding the one being edited', () => {
    const first = api.createSession(entry(3, 2))
    api.createSession(entry(5, 4))
    expect(
      api.findOverlaps({ startedAt: NOW - 2.5 * HOUR, endedAt: NOW - 1 * HOUR }).map((s) => s.id),
    ).toEqual([first.id])
    expect(
      api.findOverlaps({ id: first.id, startedAt: NOW - 3 * HOUR, endedAt: NOW - 2 * HOUR }),
    ).toEqual([])
  })

  it('treats a running session as lasting until now', () => {
    const running = api.startTimer(a.id).running!
    api.updateSession(running.id, { startedAt: NOW - 30 * MIN })
    expect(api.findOverlaps({ startedAt: NOW - HOUR, endedAt: NOW - 10 * MIN })).toHaveLength(1)
    expect(api.findOverlaps({ startedAt: NOW - HOUR, endedAt: NOW - 40 * MIN })).toHaveLength(0)
  })
})

describe('split and delete', () => {
  it('splits a session in two', () => {
    const s = api.createSession(entry(3, 1))
    api.splitSession(s.id, NOW - 2 * HOUR)
    const all = api.listSessions({ start: 0, end: NOW })
    expect(all.map((x) => [x.startedAt, x.endedAt, x.source])).toEqual([
      [NOW - 3 * HOUR, NOW - 2 * HOUR, 'manual'],
      [NOW - 2 * HOUR, NOW - 1 * HOUR, 'split'],
    ])
  })

  it('soft-deletes a session', () => {
    const s = api.createSession(entry(3, 2))
    api.deleteSession(s.id)
    expect(api.listSessions({ start: 0, end: NOW })).toEqual([])
    expect(toResult(() => api.deleteSession(s.id))).toMatchObject({ error: { code: 'not-found' } })
  })
})
