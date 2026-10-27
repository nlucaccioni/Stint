// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createApiHandlers, type ApiHandlers } from '../api'
import { openDatabase, type Db } from '../db/connection'
import { buildProjects, buildState } from './state'

// Tuesday 10 March 2026, 09:00 UTC.
const NOW = Date.UTC(2026, 2, 10, 9)
const HOUR = 3_600_000
const ZONE = 'UTC'
let api: ApiHandlers
let db: Db
let clock: number

beforeEach(() => {
  db = openDatabase(':memory:')
  clock = NOW
  api = createApiHandlers({
    db,
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => clock,
  })
})

function setup() {
  const acme = api.createClient({
    name: 'Acme',
    color: '#336699',
    hourlyRateCents: 10_000,
    currency: 'USD',
  })
  const site = api.createProject({
    clientId: acme.id,
    name: 'Site',
    hourlyRateCents: null,
    billableByDefault: true,
  })
  const admin = api.createProject({
    clientId: acme.id,
    name: 'Admin',
    hourlyRateCents: null,
    billableByDefault: false,
  })
  return { acme, site, admin }
}

describe('buildState', () => {
  it('is empty with no data', () => {
    expect(buildState(db, NOW, ZONE)).toEqual({
      type: 'state',
      running: null,
      favorites: Array.from({ length: 9 }, () => null),
      totals: { todaySeconds: 0, weekSeconds: 0, unbilledSeconds: 0, unbilledAmounts: [] },
    })
  })

  it('counts today, this week, and unbilled time, including the running timer', () => {
    const { acme, site, admin } = setup()
    // Monday (this week): 2h billable.
    api.createSession({
      projectId: site.id,
      startedAt: NOW - 24 * HOUR,
      endedAt: NOW - 22 * HOUR,
      note: '',
      billable: true,
    })
    // Today: 1h non-billable.
    api.createSession({
      projectId: admin.id,
      startedAt: NOW - 3 * HOUR,
      endedAt: NOW - 2 * HOUR,
      note: '',
      billable: false,
    })
    // Running for 30 minutes (billable).
    clock = NOW - HOUR / 2
    api.startTimer(site.id)

    const state = buildState(db, NOW, ZONE)
    expect(state.running).toMatchObject({
      projectId: site.id,
      clientId: acme.id,
      startedAt: NOW - HOUR / 2,
    })
    expect(state.totals).toEqual({
      todaySeconds: 1.5 * 3600,
      weekSeconds: 3.5 * 3600,
      unbilledSeconds: 2.5 * 3600,
      unbilledAmounts: [{ currency: 'USD', cents: 25_000 }],
    })
  })

  it('leaves billed time out of unbilled', () => {
    const { acme, site } = setup()
    const session = api.createSession({
      projectId: site.id,
      startedAt: NOW - 2 * HOUR,
      endedAt: NOW - HOUR,
      note: '',
      billable: true,
    })
    api.createBatch({
      clientId: acme.id,
      rangeStart: 0,
      rangeEnd: NOW,
      sessionIds: [session.id],
      reference: '',
      billedAt: NOW,
      note: '',
    })
    expect(buildState(db, NOW, ZONE).totals).toMatchObject({
      todaySeconds: 3600,
      unbilledSeconds: 0,
      unbilledAmounts: [],
    })
  })

  it('includes the favorite slots', () => {
    const { site } = setup()
    const favorites = Array.from({ length: 9 }, (_, i) => (i === 2 ? site.id : null))
    api.updatePreferences({ favorites })
    expect(buildState(db, NOW, ZONE).favorites).toEqual(favorites)
  })
})

describe('buildProjects', () => {
  it('lists active projects of active clients in the user order', () => {
    const { acme, site, admin } = setup()
    const other = api.createClient({
      name: 'Other',
      color: '#aa0000',
      hourlyRateCents: null,
      currency: 'USD',
    })
    const hidden = api.createProject({
      clientId: other.id,
      name: 'Hidden',
      hourlyRateCents: null,
      billableByDefault: true,
    })
    api.updateClient(other.id, { archived: true })
    api.moveProject(admin.id, site.id) // Admin first

    const archived = api.createProject({
      clientId: acme.id,
      name: 'Old',
      hourlyRateCents: null,
      billableByDefault: true,
    })
    api.updateProject(archived.id, { archived: true })

    const list = buildProjects(db).list
    expect(list.map((p) => p.name)).toEqual(['Admin', 'Site'])
    expect(list[0]).toEqual({
      id: admin.id,
      clientId: acme.id,
      name: 'Admin',
      clientName: 'Acme',
      color: '#336699',
    })
    expect(list.some((p) => p.id === hidden.id)).toBe(false)
  })
})
