// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiHandlers, type ApiHandlers } from './api'
import { openDatabase } from './db/connection'
import { toResultAsync } from './result'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 2, 10, 18)
const NY = 'America/New_York'

let api: ApiHandlers
let saved: { name: string; contents: string } | null
let chooseCancel: boolean
let revealed: string[]

beforeEach(() => {
  saved = null
  chooseCancel = false
  revealed = []
  api = createApiHandlers({
    db: openDatabase(':memory:'),
    deviceId: 'dev-test',
    appInfo: { version: '0.0.0', platform: 'win32' },
    now: () => NOW,
    saveFile: async (name, contents) => {
      if (chooseCancel) return null
      saved = { name, contents }
      return `C:/exports/${name}`
    },
    revealFile: (path) => revealed.push(path),
  })
  const client = api.createClient({
    name: 'Café Ünïcode',
    color: '#336699',
    hourlyRateCents: 10_000,
    currency: 'EUR',
  })
  const project = api.createProject({
    clientId: client.id,
    name: 'Site',
    color: null,
    hourlyRateCents: null,
    billableByDefault: true,
  })
  api.createSession({
    projectId: project.id,
    startedAt: NOW - 3 * HOUR,
    endedAt: NOW - 2 * HOUR,
    note: '=SUM(A1)',
    billable: true,
  })
})

// March 10 2026 in New York
const day = { start: Date.UTC(2026, 2, 10, 4), end: Date.UTC(2026, 2, 11, 4) }

describe('exportCsv', () => {
  it('writes a CSV of the range with a UTF-8 BOM and a dated file name', async () => {
    expect(await api.exportCsv(day, NY)).toEqual({ saved: true, count: 1 })
    expect(saved!.name).toBe('stint-2026-03-10.csv')
    expect(saved!.contents.startsWith('\uFEFFDate,Start,End,Duration')).toBe(true)
    expect(saved!.contents).toContain('Café Ünïcode')
    // Formula-looking notes are neutralized (core's CSV rules)
    expect(saved!.contents).toContain("'=SUM(A1)")
  })

  it('names multi-day exports with both dates', async () => {
    await api.exportCsv({ start: day.start, end: day.end + 6 * 24 * HOUR }, NY)
    expect(saved!.name).toBe('stint-2026-03-10-to-2026-03-16.csv')
  })

  it('reports a cancelled save dialog', async () => {
    chooseCancel = true
    expect(await api.exportCsv(day, NY)).toEqual({ saved: false, count: 0 })
  })

  it('rejects an unknown time zone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await toResultAsync(() => api.exportCsv(day, 'Mars/Olympus'))).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('reveals only the file it just exported', async () => {
    api.showExportedFile()
    expect(revealed).toEqual([])
    await api.exportCsv(day, NY)
    api.showExportedFile()
    expect(revealed).toEqual(['C:/exports/stint-2026-03-10.csv'])
  })
})
