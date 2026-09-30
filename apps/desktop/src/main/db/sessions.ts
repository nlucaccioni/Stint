// SPDX-License-Identifier: GPL-3.0-or-later
import type { Session, SessionChange, TimeRange } from '@stint/core'
import type { Db } from './connection'
import { fromRow, getById, insertRow, selectList, updateRow } from './table'
import { sessionsTable as t } from './tables'

export const getSession = (db: Db, id: string) => getById(db, t, id)

/** IDs of projects that have any (non-deleted) recorded time. */
export function projectIdsWithTime(db: Db): string[] {
  return db
    .prepare('SELECT DISTINCT project_id FROM sessions WHERE deleted_at IS NULL')
    .all()
    .map((row) => row['project_id'] as string)
}

/** The running timer, if any. The database guarantees there is at most one. */
export function getRunningSession(db: Db): Session | null {
  const row = db
    .prepare(`SELECT ${selectList(t)} FROM sessions WHERE ended_at IS NULL AND deleted_at IS NULL`)
    .get()
  return row ? fromRow(t, row) : null
}

/** Non-deleted sessions overlapping `range` (including a running one), oldest first. */
export function listSessions(db: Db, range: TimeRange): Session[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM sessions
       WHERE deleted_at IS NULL
         AND started_at < ?
         AND (ended_at IS NULL OR ended_at > ?)
       ORDER BY started_at`,
    )
    .all(range.end, range.start)
    .map((row) => fromRow(t, row))
}

/**
 * Save the changes returned by a core action. Call inside `transaction()` so a
 * multi-step change (like switching timers) is saved all together or not at all.
 * Updates run before inserts, so stopping the old timer frees the "one running"
 * slot before the new one is added.
 */
export function applySessionChanges(db: Db, changes: readonly SessionChange[]): void {
  for (const change of changes) {
    if (change.kind === 'update') updateRow<Session>(db, t, change.id, change.patch)
  }
  for (const change of changes) {
    if (change.kind === 'insert') insertRow(db, t, change.session)
  }
}
