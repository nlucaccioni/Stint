// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDeviceSettings, saveDeviceSettings } from './device'

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
    expect(loadDeviceSettings(dir).deviceId).toBe(first.deviceId)
  })

  it('replaces an unreadable file and keeps the bad one aside', () => {
    writeFileSync(join(dir, 'device.json'), '{ not json')
    const settings = loadDeviceSettings(dir)
    expect(settings.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(readdirSync(dir).some((f) => f.startsWith('device.json.invalid-'))).toBe(true)
  })

  it('keeps hotkey overrides and drops malformed ones', () => {
    const { deviceId } = loadDeviceSettings(dir)
    saveDeviceSettings(dir, {
      deviceId,
      hotkeys: { stop: 'Control+Alt+F12', switcher: null, favorite1: 42 as unknown as string },
    })
    expect(loadDeviceSettings(dir).hotkeys).toEqual({ stop: 'Control+Alt+F12', switcher: null })
  })
})
