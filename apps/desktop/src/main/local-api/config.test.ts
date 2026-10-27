// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadLocalApiConfig, saveLocalApiConfig } from './config'

let dir: string
const file = () => join(dir, 'local-api.json')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'stint-local-api-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadLocalApiConfig', () => {
  it('creates the file with a random token on first launch', () => {
    const config = loadLocalApiConfig(dir, 47823)
    expect(config).toEqual({
      enabled: true,
      port: 47823,
      token: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({ v: 1, ...config })
    expect(loadLocalApiConfig(dir, 47823)).toEqual(config)
  })

  it('keeps saved settings', () => {
    const saved = { enabled: false, port: 50000, token: 'f'.repeat(64) }
    saveLocalApiConfig(dir, saved)
    expect(loadLocalApiConfig(dir, 47823)).toEqual(saved)
  })

  it('repairs bad values and saves the repair', () => {
    writeFileSync(file(), JSON.stringify({ enabled: true, port: 80, token: 'short' }))
    const config = loadLocalApiConfig(dir, 47823)
    expect(config.port).toBe(47823)
    expect(config.token).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toMatchObject({
      port: 47823,
      token: config.token,
    })
  })

  it('starts fresh from an unreadable file', () => {
    writeFileSync(file(), '{ nope')
    expect(loadLocalApiConfig(dir, 47823)).toMatchObject({ enabled: true, port: 47823 })
  })
})
