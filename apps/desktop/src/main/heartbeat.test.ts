// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readHeartbeat, writeHeartbeat } from './heartbeat'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stint-heartbeat-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('heartbeat', () => {
  it('reads back what was written', () => {
    writeHeartbeat(dir, 1_793_000_000_000)
    expect(readHeartbeat(dir)).toBe(1_793_000_000_000)
  })

  it('is null before the first write or when unreadable', () => {
    expect(readHeartbeat(dir)).toBeNull()
    writeFileSync(join(dir, 'heartbeat.json'), '{ not json')
    expect(readHeartbeat(dir)).toBeNull()
    writeFileSync(join(dir, 'heartbeat.json'), '{"at":"soon"}')
    expect(readHeartbeat(dir)).toBeNull()
  })
})
