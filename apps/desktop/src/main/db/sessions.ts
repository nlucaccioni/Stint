// SPDX-License-Identifier: GPL-3.0-or-later
import type { Session, SessionChange, TimeRange } from '@stint/core'
import type { Db } from './connection'
import { fromRow, getById, insertRow, selectList, updateRow } from './table'
import { sessionsTable as t } from './tables'

export const getSession = (db: Db, id: string) => getById(db, t, id)

/** Every unbilled, billable, finished session (candidates for billing), oldest first. */
export function listUnbilledSessions(db: Db): Session[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM sessions
       WHERE deleted_at IS NULL AND billing_batch_id IS NULL AND billable = 1 AND ended_at IS NOT NULL
       ORDER BY started_at`,
    )
    .all()
    .map((row) => fromRow(t, row))
}

/** Every session in any billing batch (for batch summaries), oldest first. */
export function listBilledSessions(db: Db): Session[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM sessions
       WHERE deleted_at IS NULL AND billing_batch_id IS NOT NULL ORDER BY started_at`,
    )
    .all()
    .map((row) => fromRow(t, row))
}

/** The sessions in one billing batch, oldest first. */
export function listBatchSessions(db: Db, batchId: string): Session[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM sessions
       WHERE deleted_at IS NULL AND billing_batch_id = ? ORDER BY started_at`,
    )
    .all(batchId)
    .map((row) => fromRow(t, row))
}

/** Projects with the most recently started time, newest first. */
export function recentProjectIds(db: Db, limit: number): string[] {
  return db
    .prepare(
      `SELECT project_id FROM sessions WHERE deleted_at IS NULL
       GROUP BY project_id ORDER BY MAX(started_at) DESC LIMIT ?`,
    )
    .all(limit)
    .map((row) => row['project_id'] as string)
}

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
