// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandlers, type ApiHandlers } from './api'
import { openDatabase } from './db/connection'
import { toResult } from './result'

const NOW = Date.UTC(2026, 2, 10, 9)
let api: ApiHandlers

beforeEach(() => {
  api = createApiHandlers({
    db: openDatabase(':memory:'),
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => NOW,
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
