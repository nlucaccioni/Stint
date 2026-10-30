// SPDX-License-Identifier: GPL-3.0-or-later
// When Stint was last known to be running on this machine. Written once a minute,
// so a timer that Stint didn't get to stop (a crash, power loss, or the OS ending
// it during shutdown) can be ended close to when Stint actually went away
// (SPEC.md §6). Device-local, like device.json: it never syncs.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE = 'heartbeat.json'

/** How often the heartbeat is written, so at most this much time is lost. */
export const HEARTBEAT_MS = 60_000

/** The last heartbeat, or null if there's none (first launch) or it's unreadable. */
export function readHeartbeat(dir: string): number | null {
  try {
    const { at } = JSON.parse(readFileSync(join(dir, FILE), 'utf8')) as { at?: unknown }
    return typeof at === 'number' && Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

export function writeHeartbeat(dir: string, at: number): void {
  // Temp file then rename, so a crash mid-write can't leave a half-written file.
  const path = join(dir, FILE)
  writeFileSync(`${path}.tmp`, JSON.stringify({ at }))
  renameSync(`${path}.tmp`, path)
}
