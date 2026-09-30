// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDeviceSettings } from './device'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stint-device-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('loadDeviceSettings', () => {
  it('creates a device ID on first launch and keeps it', () => {
    const first = loadDeviceSettings(dir)
    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(existsSync(join(dir, 'device.json'))).toBe(true)
    expect(loadDeviceSettings(dir)).toEqual(first)
  })

  it('replaces an unreadable file and keeps the bad one aside', () => {
    writeFileSync(join(dir, 'device.json'), '{ not json')
    const settings = loadDeviceSettings(dir)
    expect(settings.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(readdirSync(dir).some((f) => f.startsWith('device.json.invalid-'))).toBe(true)
  })
})
