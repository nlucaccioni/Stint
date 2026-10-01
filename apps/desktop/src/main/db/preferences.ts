// SPDX-License-Identifier: GPL-3.0-or-later
// Synced preferences: one row per setting, keyed by its name (see migration 2).
import { defaultPreferences, preferenceKeys, type Preferences } from '@stint/core'
import type { Db } from './connection'

/** Stored values merged over the defaults. */
export function getPreferences(db: Db): Preferences {
  const prefs: Record<string, unknown> = { ...defaultPreferences }
  const rows = db.prepare('SELECT id, value FROM preferences WHERE deleted_at IS NULL').all() as {
    id: string
    value: string
  }[]
  for (const row of rows) {
    if ((preferenceKeys as string[]).includes(row.id)) prefs[row.id] = JSON.parse(row.value)
  }
  return prefs as unknown as Preferences
}

/** Save already-validated values. */
export function setPreferences(
  db: Db,
  values: Partial<Preferences>,
  stamp: { now: number; deviceId: string },
): void {
  const upsert = db.prepare(
    `INSERT INTO preferences (id, value, created_at, updated_at, device_id, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT (id) DO UPDATE SET
       value = excluded.value, updated_at = excluded.updated_at,
       device_id = excluded.device_id, deleted_at = NULL`,
  )
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    upsert.run(key, JSON.stringify(value), stamp.now, stamp.now, stamp.deviceId)
  }
}
