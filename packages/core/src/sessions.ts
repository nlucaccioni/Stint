// SPDX-License-Identifier: GPL-3.0-or-later
// Editing recorded time (SPEC.md §6 "Editing"). Each function checks the rules
// and returns the changes to apply, or throws a StintError.
import { isLocked } from './billing'
import { insert, update, type ChangeContext, type SessionChange } from './changes'
import { StintError } from './errors'
import { rangesOverlap } from './time'
import type { Session } from './types'

export function assertEditable(session: Session): void {
  if (session.deletedAt !== null) {
    throw new StintError('session-deleted', 'This session has been deleted.')
  }
  if (isLocked(session)) {
    throw new StintError('session-locked', 'This session is billed. Unlock it to edit.')
  }
}

/** For a running session pass `endedAt: null`. */
export function validateTimes(startedAt: number, endedAt: number | null, now: number): void {
  if (startedAt > now || (endedAt !== null && endedAt > now)) {
    throw new StintError('in-future', 'Sessions cannot be in the future.')
  }
  if (endedAt !== null && endedAt <= startedAt) {
    throw new StintError('end-before-start', 'End time must be after start time.')
  }
}

/**
 * Other sessions that share time with `candidate`. Overlaps are allowed but the
 * UI should warn about them. Touching end-to-start is not an overlap.
 */
export function findOverlaps(
  candidate: Pick<Session, 'startedAt' | 'endedAt'> & { id?: string },
  sessions: readonly Session[],
  now: number,
): Session[] {
  const range = { start: candidate.startedAt, end: candidate.endedAt ?? now }
  return sessions.filter(
    (s) =>
      s.id !== candidate.id &&
      s.deletedAt === null &&
      rangesOverlap(range, { start: s.startedAt, end: s.endedAt ?? now }),
  )
}

export interface SessionEdits {
  projectId?: string
  startedAt?: number
  /** Only for finished sessions. Use `stopAt` to end a running one. */
  endedAt?: number
  note?: string
  billable?: boolean
}

/** Change times, move to another project, or edit note/billable. */
export function editSession(
  session: Session,
  edits: SessionEdits,
  ctx: ChangeContext,
): SessionChange {
  assertEditable(session)
  if (session.endedAt === null && edits.endedAt !== undefined) {
    throw new StintError(
      'session-running',
      'Stop the running timer instead of setting its end time.',
    )
  }
  const startedAt = edits.startedAt ?? session.startedAt
  const endedAt = edits.endedAt ?? session.endedAt
  validateTimes(startedAt, endedAt, ctx.now)
  return update(ctx, session.id, edits)
}

export interface ManualEntry {
  projectId: string
  startedAt: number
  endedAt: number
  note?: string
  billable: boolean
}

export function createManualSession(entry: ManualEntry, ctx: ChangeContext): SessionChange {
  validateTimes(entry.startedAt, entry.endedAt, ctx.now)
  return insert(ctx, {
    projectId: entry.projectId,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    note: entry.note ?? '',
    billable: entry.billable,
    billingBatchId: null,
    source: 'manual',
  })
}

/**
 * Split one session into two at `at`. The original keeps the first half; a new
 * session gets the second. Splitting a running session leaves the second half running.
 */
export function splitSession(session: Session, at: number, ctx: ChangeContext): SessionChange[] {
  assertEditable(session)
  const end = session.endedAt ?? ctx.now
  if (at <= session.startedAt || at >= end) {
    throw new StintError('split-out-of-range', 'Split time must be inside the session.')
  }
  return [
    update(ctx, session.id, { endedAt: at }),
    insert(ctx, {
      projectId: session.projectId,
      startedAt: at,
      endedAt: session.endedAt,
      note: session.note,
      billable: session.billable,
      billingBatchId: null,
      source: 'split',
    }),
  ]
}

/** Soft delete. */
export function deleteSession(session: Session, ctx: ChangeContext): SessionChange {
  assertEditable(session)
  return update(ctx, session.id, { deletedAt: ctx.now })
}
