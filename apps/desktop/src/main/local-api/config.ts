// SPDX-License-Identifier: GPL-3.0-or-later
// The Local API's settings live in local-api.json in the app data folder. They're
// device-local (never synced, never in git). The Keypad plugin reads this same
// file to find the port and token, so the user never has to copy a token
// anywhere (docs/protocol.md "Connecting").
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROTOCOL_VERSION } from './protocol'

export interface LocalApiConfig {
  enabled: boolean
  port: number
  token: string
}

const FILE = 'local-api.json'

export function newToken(): string {
  return randomBytes(32).toString('hex')
}

export function isValidPort(port: number): boolean {
  // Below 1024 needs admin rights on macOS; 65535 is the highest port there is.
  return Number.isInteger(port) && port >= 1024 && port <= 65535
}

/** Read the settings, creating the file (with a fresh token) if it's missing or broken. */
export function loadLocalApiConfig(dir: string, defaultPort: number): LocalApiConfig {
  const path = join(dir, FILE)
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LocalApiConfig>
      const config: LocalApiConfig = {
        enabled: parsed.enabled !== false,
        port:
          typeof parsed.port === 'number' && isValidPort(parsed.port) ? parsed.port : defaultPort,
        token:
          typeof parsed.token === 'string' && /^[0-9a-f]{64}$/.test(parsed.token)
            ? parsed.token
            : newToken(),
      }
      // Write back any repaired values so the plugin reads the same ones.
      if (config.port !== parsed.port || config.token !== parsed.token) {
        saveLocalApiConfig(dir, config)
      }
      return config
    } catch {
      // Unreadable: start fresh below. A new token only means the plugin reconnects.
    }
  }
  const config: LocalApiConfig = { enabled: true, port: defaultPort, token: newToken() }
  saveLocalApiConfig(dir, config)
  return config
}

export function saveLocalApiConfig(dir: string, config: LocalApiConfig): void {
  const path = join(dir, FILE)
  const contents = JSON.stringify({ v: PROTOCOL_VERSION, ...config }, null, 2)
  // Temp file + rename, so a reader never sees a half-written file. Mode 0o600:
  // only this user can read the token (macOS; on Windows the user's AppData
  // folder is already private to them).
  writeFileSync(`${path}.tmp`, contents, { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}
