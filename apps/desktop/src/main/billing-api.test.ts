// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import type { Client, Project, Session } from '@stint/core'
import { createApiHandlers, type ApiHandlers } from './api'
import { openDatabase } from './db/connection'
import { toResult } from './result'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 3, 1, 12)
const MARCH = { rangeStart: Date.UTC(2026, 2, 1), rangeEnd: Date.UTC(2026, 3, 1) }

let api: ApiHandlers
let client: Client
let project: Project
let sessions: Session[]
let events: { batches: number; sessions: number }
let saved: string | null

beforeEach(() => {
  events = { batches: 0, sessions: 0 }
  saved = null
  api = createApiHandlers({
    db: openDatabase(':memory:'),
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => NOW,
    onBatchesChanged: () => events.batches++,
    onSessionsChanged: () => events.sessions++,
    saveFile: async (_name, contents) => {
      saved = contents
      return 'x.csv'
    },
  })
  client = api.createClient({
    name: 'Acme',
    color: '#000000',
    hourlyRateCents: 10_000,
    currency: 'USD',
  })
  project = api.createProject({
    clientId: client.id,
    name: 'Site',
    color: null,
    hourlyRateCents: null,
    billableByDefault: true,
  })
  const at = (day: number) => Date.UTC(2026, 2, day, 9)
  sessions = [2, 3, 4].map((day) =>
    api.createSession({
      projectId: project.id,
      startedAt: at(day),
      endedAt: at(day) + HOUR,
      note: '',
      billable: true,
    }),
  )
  events = { batches: 0, sessions: 0 }
})

function bill(ids = sessions.map((s) => s.id)) {
  return api.createBatch({
    clientId: client.id,
    ...MARCH,
    sessionIds: ids,
    reference: 'INV-1',
    billedAt: NOW,
    note: '',
  })
}

describe('creating a batch', () => {
  it('locks the chosen sessions at their current rate and records rounding', () => {
    api.updatePreferences({ billingRoundingMinutes: 15, billingRoundingMode: 'nearest' })
    const batch = bill([sessions[0]!.id, sessions[1]!.id])
    expect(batch).toMatchObject({
      reference: 'INV-1',
      paidAt: null,
      roundingMinutes: 15,
      roundingMode: 'nearest',
    })
    const inBatch = api.listBatchSessions(batch.id)
    expect(inBatch.map((s) => [s.billingBatchId, s.billedRateCents])).toEqual([
      [batch.id, 10_000],
      [batch.id, 10_000],
    ])
    expect(api.listUnbilledSessions().map((s) => s.id)).toEqual([sessions[2]!.id])
    expect(api.listBatches()).toEqual([batch])
    expect(events).toEqual({ batches: 1, sessions: 1 })
  })

  it('keeps billed sessions read-only', () => {
    bill()
    expect(toResult(() => api.updateSession(sessions[0]!.id, { note: 'x' }))).toMatchObject({
      error: { code: 'session-locked' },
    })
  })

  it('refuses sessions that are already billed', () => {
    bill([sessions[0]!.id])
    expect(toResult(() => bill([sessions[0]!.id]))).toMatchObject({
      error: { code: 'not-eligible' },
    })
  })

  it('keeps the billed rate after the client rate changes', () => {
    bill()
    api.updateClient(client.id, { hourlyRateCents: 20_000 })
    expect(api.listBatchSessions(api.listBatches()[0]!.id)[0]!.billedRateCents).toBe(10_000)
  })
})

describe('after billing', () => {
  it('marks paid and unpaid', () => {
    const batch = bill()
    expect(api.updateBatch(batch.id, { paidAt: NOW + HOUR }).paidAt).toBe(NOW + HOUR)
    expect(api.updateBatch(batch.id, { paidAt: null }).paidAt).toBeNull()
  })

  it('adds a forgotten session to an unpaid batch', () => {
    const batch = bill([sessions[0]!.id])
    api.addToBatch(batch.id, [sessions[1]!.id])
    expect(api.listBatchSessions(batch.id)).toHaveLength(2)
  })

  it('unlocks one session so it can be edited', () => {
    const batch = bill()
    const unlocked = api.unlockSession(sessions[0]!.id)
    expect(unlocked).toMatchObject({ billingBatchId: null, billedRateCents: null })
    expect(api.listBatchSessions(batch.id)).toHaveLength(2)
    expect(() => api.updateSession(sessions[0]!.id, { note: 'fixed' })).not.toThrow()
  })

  it('un-bills an unpaid batch, but not a paid one', () => {
    const batch = bill()
    api.updateBatch(batch.id, { paidAt: NOW })
    expect(toResult(() => api.unbillBatch(batch.id))).toMatchObject({
      error: { code: 'batch-paid' },
    })
    api.updateBatch(batch.id, { paidAt: null })
    api.unbillBatch(batch.id)
    expect(api.listBatches()).toEqual([])
    expect(api.listUnbilledSessions()).toHaveLength(3)
  })

  it('exports billing status and reference to CSV', async () => {
    const batch = bill([sessions[0]!.id])
    api.updateBatch(batch.id, { paidAt: NOW })
    await api.exportCsv({ start: 0, end: NOW }, 'UTC')
    const rows = saved!.trim().split('\r\n').slice(1)
    expect(rows.map((r) => r.split(',').slice(-2).join(','))).toEqual([
      'paid,INV-1',
      'unbilled,',
      'unbilled,',
    ])
  })
})
