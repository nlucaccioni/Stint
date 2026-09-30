// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { start, toggle, type Client, type Project, type Session } from '@stint/core'
import { migrations } from './migrations'
import { openDatabase, schemaVersion, transaction, type Db } from './connection'
import { getClient, insertClient, listClients, updateClient } from './clients'
import { insertProject, listProjects } from './projects'
import { applySessionChanges, getRunningSession, getSession, listSessions } from './sessions'

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 2, 10, 9)
const sync = { createdAt: T0, updatedAt: T0, deviceId: 'dev', deletedAt: null }

const acme: Client = {
  ...sync,
  id: 'c1',
  name: 'Acme',
  color: '#336699',
  hourlyRateCents: 10_000,
  currency: 'USD',
  archived: false,
}
const site: Project = {
  ...sync,
  id: 'p1',
  clientId: 'c1',
  name: 'Website',
  color: null,
  hourlyRateCents: null,
  billableByDefault: true,
  archived: false,
}
const app: Project = { ...site, id: 'p2', name: 'App', billableByDefault: false }

function session(overrides: Partial<Session>): Session {
  return {
    ...sync,
    id: 's1',
    projectId: 'p1',
    startedAt: T0,
    endedAt: T0 + HOUR,
    note: '',
    billable: true,
    billingBatchId: null,
    source: 'manual',
    ...overrides,
  }
}

const insert = (s: Session) => ({ kind: 'insert' as const, session: s })

const tempDir = mkdtempSync(join(tmpdir(), 'stint-db-test-'))
let tempCount = 0
const tempDbPath = () => join(tempDir, `test-${++tempCount}.db`)
afterAll(() => rmSync(tempDir, { recursive: true, force: true }))

let db: Db
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('migrations', () => {
  it('brings a new database to the latest version', () => {
    expect(schemaVersion(db)).toBe(migrations.length)
  })

  it('refuses a database from a newer app version', () => {
    const path = tempDbPath()
    const newer = openDatabase(path)
    newer.exec(`PRAGMA user_version = ${migrations.length + 1}`)
    newer.close()
    expect(() => openDatabase(path)).toThrow(/newer than this app supports/)
  })
})

describe('clients and projects', () => {
  it('round-trips records, including booleans and nulls', () => {
    insertClient(db, acme)
    insertProject(db, site)
    expect(listClients(db)).toEqual([acme])
    expect(listProjects(db)).toEqual([site])
  })

  it('updates fields and hides soft-deleted rows from lists', () => {
    insertClient(db, acme)
    updateClient(db, 'c1', { name: 'Acme Co', hourlyRateCents: null, archived: true })
    expect(getClient(db, 'c1')).toMatchObject({
      name: 'Acme Co',
      hourlyRateCents: null,
      archived: true,
    })
    updateClient(db, 'c1', { deletedAt: T0 })
    expect(listClients(db)).toEqual([])
    expect(getClient(db, 'c1')).not.toBeNull()
  })

  it('throws when updating a missing row', () => {
    expect(() => updateClient(db, 'nope', { name: 'x' })).toThrow('no row')
  })

  it('rejects negative rates', () => {
    expect(() => insertClient(db, { ...acme, hourlyRateCents: -1 })).toThrow()
  })
})

describe('sessions', () => {
  it('round-trips a session', () => {
    const s = session({ note: 'hello', billable: false })
    applySessionChanges(db, [insert(s)])
    expect(getSession(db, 's1')).toEqual(s)
  })

  it('allows only one running session', () => {
    applySessionChanges(db, [insert(session({ id: 'a', endedAt: null }))])
    expect(() => applySessionChanges(db, [insert(session({ id: 'b', endedAt: null }))])).toThrow(
      /UNIQUE/,
    )
  })

  it('allows a new running session once the old one is deleted', () => {
    applySessionChanges(db, [insert(session({ id: 'a', endedAt: null, deletedAt: T0 }))])
    expect(() =>
      applySessionChanges(db, [insert(session({ id: 'b', endedAt: null }))]),
    ).not.toThrow()
  })

  it('rejects an end time before the start time', () => {
    expect(() => applySessionChanges(db, [insert(session({ endedAt: T0 - 1 }))])).toThrow(/CHECK/)
  })

  it('finds sessions overlapping a range, including a running one', () => {
    applySessionChanges(db, [
      insert(session({ id: 'before', startedAt: T0 - 3 * HOUR, endedAt: T0 - 2 * HOUR })),
      insert(session({ id: 'edge', startedAt: T0 - HOUR, endedAt: T0 })),
      insert(session({ id: 'inside', startedAt: T0, endedAt: T0 + HOUR })),
      insert(session({ id: 'gone', startedAt: T0, endedAt: T0 + HOUR, deletedAt: T0 })),
      insert(session({ id: 'running', startedAt: T0 + 2 * HOUR, endedAt: null })),
    ])
    const found = listSessions(db, { start: T0, end: T0 + 5 * HOUR })
    expect(found.map((s) => s.id)).toEqual(['inside', 'running'])
  })
})

describe('core timer actions saved in a transaction', () => {
  beforeEach(() => {
    insertClient(db, acme)
    insertProject(db, site)
    insertProject(db, app)
  })

  function run(action: (running: Session | null) => ReturnType<typeof toggle>): void {
    transaction(db, () => applySessionChanges(db, action(getRunningSession(db))))
  }

  it('switching projects stops one and starts the other at the same instant', () => {
    const ctx = (now: number) => ({ now, deviceId: 'dev' })
    run((r) => toggle(r, site, ctx(T0)))
    run((r) => toggle(r, app, ctx(T0 + HOUR)))

    const running = getRunningSession(db)!
    expect(running).toMatchObject({ projectId: 'p2', startedAt: T0 + HOUR, billable: false })
    const all = listSessions(db, { start: 0, end: T0 + 2 * HOUR })
    expect(all.map((s) => [s.projectId, s.startedAt, s.endedAt])).toEqual([
      ['p1', T0, T0 + HOUR],
      ['p2', T0 + HOUR, null],
    ])
  })

  it('a running timer survives closing and reopening the database', () => {
    const path = tempDbPath()
    const first = openDatabase(path)
    insertProject(first, site)
    transaction(first, () =>
      applySessionChanges(first, start(null, site, { now: T0, deviceId: 'dev' })),
    )
    first.close()

    const reopened = openDatabase(path)
    expect(getRunningSession(reopened)).toMatchObject({
      projectId: 'p1',
      startedAt: T0,
      endedAt: null,
    })
    reopened.close()
  })

  it('rolls back every change if one fails', () => {
    run((r) => start(r, site, { now: T0, deviceId: 'dev' }))
    const running = getRunningSession(db)!
    expect(() =>
      transaction(db, () =>
        applySessionChanges(db, [
          { kind: 'update', id: running.id, patch: { endedAt: T0 + HOUR } },
          { kind: 'update', id: 'missing', patch: { note: 'x' } },
        ]),
      ),
    ).toThrow()
    expect(getRunningSession(db)?.id).toBe(running.id)
  })
})
