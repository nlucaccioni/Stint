// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultPreferences, type Preferences } from '@stint/core'
import { createApiHandlers, type ApiHandlers } from './api'
import { openDatabase, schemaVersion, type Db } from './db/connection'
import { migrations } from './db/migrations'
import { toResult } from './result'

let db: Db
let api: ApiHandlers
let events: Preferences[]

beforeEach(() => {
  db = openDatabase(':memory:')
  events = []
  api = createApiHandlers({
    db,
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => 1_000,
    onPreferencesChanged: (p) => events.push(p),
  })
})

describe('preferences', () => {
  it('returns defaults when nothing is stored', () => {
    expect(api.getPreferences()).toEqual(defaultPreferences)
  })

  it('saves changes, keeps the rest, and notifies', () => {
    const prefs = api.updatePreferences({ idleMinutes: 10, defaultCurrency: 'EUR' })
    expect(prefs).toEqual({ ...defaultPreferences, idleMinutes: 10, defaultCurrency: 'EUR' })
    expect(api.getPreferences()).toEqual(prefs)
    expect(events).toEqual([prefs])
  })

  it('stores one row per setting with sync fields', () => {
    api.updatePreferences({ nudgeHours: 2 })
    api.updatePreferences({ nudgeHours: 3 })
    expect(db.prepare('SELECT id, value, device_id FROM preferences').all()).toEqual([
      { id: 'nudgeHours', value: '3', device_id: 'dev-test' },
    ])
  })

  it('rejects invalid values', () => {
    expect(toResult(() => api.updatePreferences({ weekStartsOn: 9 }))).toMatchObject({
      error: { code: 'invalid-preference' },
    })
  })

  it('is part of the latest schema', () => {
    expect(schemaVersion(db)).toBe(migrations.length)
    expect(migrations.length).toBeGreaterThanOrEqual(2)
  })
})

describe('favorites', () => {
  const slots = (...ids: (string | null)[]) => [...ids, ...Array(9 - ids.length).fill(null)]

  function project(name: string) {
    const client = api.createClient({
      name: 'C',
      color: '#000000',
      hourlyRateCents: null,
      currency: 'USD',
    })
    return api.createProject({
      clientId: client.id,
      name,
      color: null,
      hourlyRateCents: null,
      billableByDefault: true,
    })
  }

  it('saves favorite slots', () => {
    const a = project('A')
    expect(api.updatePreferences({ favorites: slots(null, a.id) }).favorites).toEqual(
      slots(null, a.id),
    )
  })

  it('refuses unknown projects', () => {
    expect(toResult(() => api.updatePreferences({ favorites: slots('nope') }))).toMatchObject({
      error: { code: 'not-found' },
    })
  })

  it('clears a deleted project from its slot', () => {
    const a = project('A')
    const b = project('B')
    api.updatePreferences({ favorites: slots(a.id, b.id) })
    api.deleteProject(a.id)
    expect(api.getPreferences().favorites).toEqual(slots(null, b.id))
  })
})
