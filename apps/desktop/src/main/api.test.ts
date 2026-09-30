// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandlers, type ApiHandlers } from './api'
import { start } from '@stint/core'
import { openDatabase, type Db } from './db/connection'
import { applySessionChanges } from './db/sessions'
import { toResult } from './result'
import type { TimerState } from '../shared/api'

const NOW = Date.UTC(2026, 2, 10, 9)
const MIN = 60_000
let api: ApiHandlers
let db: Db
let clock: number
let timerEvents: TimerState[]

beforeEach(() => {
  db = openDatabase(':memory:')
  clock = NOW
  timerEvents = []
  api = createApiHandlers({
    db,
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => clock,
    onTimerChanged: (state) => timerEvents.push(state),
  })
})

const acme = { name: 'Acme', color: '#336699', hourlyRateCents: 10_000, currency: 'USD' }

describe('clients', () => {
  it('creates and lists clients', () => {
    const created = api.createClient(acme)
    expect(created).toMatchObject({
      ...acme,
      archived: false,
      deviceId: 'dev-test',
      createdAt: NOW,
    })
    expect(api.listClients()).toEqual([created])
  })

  it('updates a client and returns the saved record', () => {
    const { id } = api.createClient(acme)
    expect(api.updateClient(id, { name: 'Acme Co', archived: true })).toMatchObject({
      name: 'Acme Co',
      archived: true,
    })
  })

  it('reports rule violations with their code', () => {
    expect(toResult(() => api.createClient({ ...acme, name: ' ' }))).toEqual({
      ok: false,
      error: { code: 'invalid-name', message: 'Name is required.' },
    })
    expect(toResult(() => api.updateClient('missing', { name: 'x' }))).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    })
  })
})

describe('projects', () => {
  it('creates a project under an existing client', () => {
    const client = api.createClient(acme)
    const project = api.createProject({
      clientId: client.id,
      name: 'Website',
      color: null,
      hourlyRateCents: null,
      billableByDefault: true,
    })
    expect(api.listProjects()).toEqual([project])
    expect(api.updateProject(project.id, { color: '#aa0000' }).color).toBe('#aa0000')
  })

  it('refuses a project for a missing client', () => {
    const result = toResult(() =>
      api.createProject({
        clientId: 'nope',
        name: 'X',
        color: null,
        hourlyRateCents: null,
        billableByDefault: true,
      }),
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } })
  })
})

describe('deleting', () => {
  const projectFields = { name: 'P', color: null, hourlyRateCents: null, billableByDefault: true }

  function setup() {
    const client = api.createClient(acme)
    const empty = api.createProject({ ...projectFields, clientId: client.id, name: 'Empty' })
    const used = api.createProject({ ...projectFields, clientId: client.id, name: 'Used' })
    applySessionChanges(db, start(null, used, { now: NOW, deviceId: 'dev-test' }))
    return { client, empty, used }
  }

  it('reports which projects have recorded time', () => {
    const { used } = setup()
    expect(api.listProjectIdsWithTime()).toEqual([used.id])
  })

  it('deletes a project with no recorded time', () => {
    const { empty, used } = setup()
    api.deleteProject(empty.id)
    expect(api.listProjects().map((p) => p.id)).toEqual([used.id])
  })

  it('refuses to delete a project with recorded time', () => {
    const { used } = setup()
    expect(toResult(() => api.deleteProject(used.id))).toMatchObject({
      ok: false,
      error: { code: 'has-recorded-time' },
    })
  })

  it('refuses to delete a client when any of its projects has time', () => {
    const { client } = setup()
    expect(toResult(() => api.deleteClient(client.id))).toMatchObject({
      ok: false,
      error: { code: 'has-recorded-time' },
    })
    expect(api.listProjects()).toHaveLength(2)
  })

  it('deletes a client and its empty projects together', () => {
    const client = api.createClient(acme)
    api.createProject({ ...projectFields, clientId: client.id })
    api.deleteClient(client.id)
    expect(api.listClients()).toEqual([])
    expect(api.listProjects()).toEqual([])
  })

  it('counts deleted time as no time', () => {
    const { used } = setup()
    db.exec('UPDATE sessions SET deleted_at = 1')
    expect(() => api.deleteProject(used.id)).not.toThrow()
  })
})

describe('timer', () => {
  const getSessionEnd = () =>
    (db.prepare('SELECT ended_at FROM sessions').get() as { ended_at: number }).ended_at

  const fields = { color: null, hourlyRateCents: null, billableByDefault: true }
  function setup() {
    const client = api.createClient(acme)
    const a = api.createProject({ ...fields, clientId: client.id, name: 'A' })
    const b = api.createProject({ ...fields, clientId: client.id, name: 'B' })
    return { client, a, b }
  }

  it('starts with no timer running', () => {
    expect(api.getTimerState()).toEqual({ running: null })
  })

  it('toggle starts, switches, and stops, notifying each time', () => {
    const { a, b } = setup()
    expect(api.toggleTimer(a.id).running).toMatchObject({ projectId: a.id, startedAt: NOW })

    clock = NOW + 30 * MIN
    expect(api.toggleTimer(b.id).running).toMatchObject({ projectId: b.id, startedAt: clock })

    clock = NOW + 45 * MIN
    expect(api.toggleTimer(b.id)).toEqual({ running: null })

    expect(timerEvents.map((e) => e.running?.projectId ?? null)).toEqual([a.id, b.id, null])
  })

  it('start does nothing (and sends no event) if the project is already running', () => {
    const { a } = setup()
    api.startTimer(a.id)
    const before = api.getTimerState()
    expect(api.startTimer(a.id)).toEqual(before)
    expect(timerEvents).toHaveLength(1)
  })

  it('stop at an earlier time', () => {
    const { a } = setup()
    api.startTimer(a.id)
    clock = NOW + 60 * MIN
    expect(api.stopTimerAt(NOW + 20 * MIN)).toEqual({ running: null })
    expect(toResult(() => api.stopTimerAt(NOW))).toMatchObject({
      ok: false,
      error: { code: 'not-running' },
    })
  })

  it('refuses to start archived projects or projects of archived clients', () => {
    const { client, a, b } = setup()
    api.updateProject(a.id, { archived: true })
    expect(toResult(() => api.toggleTimer(a.id))).toMatchObject({ error: { code: 'archived' } })
    api.updateClient(client.id, { archived: true })
    expect(toResult(() => api.startTimer(b.id))).toMatchObject({ error: { code: 'archived' } })
  })

  it('can still stop a project that was archived while running', () => {
    const { a } = setup()
    api.startTimer(a.id)
    api.updateProject(a.id, { archived: true })
    clock = NOW + 10 * MIN
    expect(api.toggleTimer(a.id)).toEqual({ running: null })
    expect(getSessionEnd()).toBe(NOW + 10 * MIN)
  })

  it('stopping with nothing running is a no-op', () => {
    expect(api.stopTimer()).toEqual({ running: null })
    expect(timerEvents).toEqual([])
  })
})

describe('untrusted input', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['missing fields', [{ name: 'Acme' }]],
    ['wrong types', [{ ...acme, hourlyRateCents: '100' }]],
    ['unknown fields', [{ ...acme, deletedAt: 1 }]],
    ['no arguments', []],
  ])('rejects %s as invalid-input', (_label, args) => {
    expect(toResult(() => api.createClient(...args))).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'Invalid request.' },
    })
  })

  it('cannot set protected fields through edits', () => {
    const { id } = api.createClient(acme)
    expect(toResult(() => api.updateClient(id, { deviceId: 'evil' }))).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('hides unexpected errors behind a generic message', () => {
    expect(
      toResult(() => {
        throw new Error('disk on fire')
      }),
    ).toEqual({ ok: false, error: { code: 'internal', message: 'Something went wrong.' } })
  })
})
