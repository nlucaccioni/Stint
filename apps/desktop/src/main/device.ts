// SPDX-License-Identifier: GPL-3.0-or-later
// Device-local settings (SPEC.md §5): belong to this machine, never sync, and
// live in a JSON file in the app data folder, outside the database.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newId } from '@stint/core'
import { hotkeyActions, type HotkeyAction } from '../shared/hotkeys'

export interface DeviceSettings {
  /** Identifies this machine in every record it writes. Created on first launch. */
  deviceId: string
  /** Shortcuts changed from the defaults on this machine (null = turned off). */
  hotkeys?: Partial<Record<HotkeyAction, string | null>>
  /** The "Stint is still running in the tray" notice was shown (Windows). */
  trayNoticeShown?: boolean
}

const FILE = 'device.json'

export function loadDeviceSettings(dir: string): DeviceSettings {
  const path = join(dir, FILE)
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DeviceSettings>
      if (typeof parsed.deviceId === 'string' && parsed.deviceId.length > 0) {
        return {
          deviceId: parsed.deviceId,
          hotkeys: validHotkeys(parsed.hotkeys),
          trayNoticeShown: parsed.trayNoticeShown === true,
        }
      }
    } catch {
      // Unreadable: fall through and start fresh.
    }
    // Keep the bad file for debugging rather than silently overwriting it.
    renameSync(path, join(dir, `${FILE}.invalid-${Date.now()}`))
  }
  const settings: DeviceSettings = { deviceId: newId() }
  saveDeviceSettings(dir, settings)
  return settings
}

export function saveDeviceSettings(dir: string, settings: DeviceSettings): void {
  // Write to a temp file, then rename: a crash mid-write can't leave a half-written file.
  const path = join(dir, FILE)
  writeFileSync(`${path}.tmp`, JSON.stringify(settings, null, 2))
  renameSync(`${path}.tmp`, path)
}

/** Keep only well-formed hotkey overrides from the file. */
function validHotkeys(value: unknown): DeviceSettings['hotkeys'] {
  if (typeof value !== 'object' || value === null) return {}
  const out: Partial<Record<HotkeyAction, string | null>> = {}
  for (const action of hotkeyActions) {
    const v = (value as Record<string, unknown>)[action]
    if (v === null || (typeof v === 'string' && v.length > 0 && v.length <= 100)) out[action] = v
  }
  return out
}
