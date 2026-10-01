// SPDX-License-Identifier: GPL-3.0-or-later
// Billing batches (SPEC.md §6 "Billing batches"). Billing status is always derived
// from a session's batch, never stored. Batches lock their sessions; unlocking is a
// deliberate action. Like other core actions, these return changes to save.
import { update, type ChangeContext, type SessionChange } from './changes'
import { StintError } from './errors'
import { newId as defaultNewId } from './ids'
import { effectiveRate, exactAmountCents } from './rates'
import { sessionDuration } from './time'
import type {
  BillingBatch,
  BillingStatus,
  Client,
  Money,
  Project,
  RoundingMode,
  Session,
  TimeRange,
} from './types'

export function billingStatus(
  session: Pick<Session, 'billingBatchId'>,
  batches: ReadonlyMap<string, Pick<BillingBatch, 'paidAt'>>,
): BillingStatus {
  if (session.billingBatchId === null) return 'unbilled'
  // A missing batch shouldn't happen; treat the session as billed so it stays locked.
  return batches.get(session.billingBatchId)?.paidAt != null ? 'paid' : 'billed'
}

/** Sessions in a billing batch are read-only until explicitly unlocked. */
export function isLocked(session: Pick<Session, 'billingBatchId'>): boolean {
  return session.billingBatchId !== null
}

// ---------------------------------------------------------------------------
// Rounding

export interface Rounding {
  /** Round each session to this many minutes; 0 = no rounding. */
  minutes: number
  mode: RoundingMode
}

export const ROUNDING_STEPS = [0, 1, 5, 6, 10, 15, 30, 60] as const

/** A session's billed length after rounding (per session, as most invoicing tools do). */
export function roundDuration(ms: number, rounding: Rounding): number {
  if (rounding.minutes <= 0 || ms <= 0) return ms
  const step = rounding.minutes * 60_000
  const steps = rounding.mode === 'up' ? Math.ceil(ms / step) : Math.round(ms / step)
  return steps * step
}

// ---------------------------------------------------------------------------
// What can be billed

/**
 * Sessions that can go into a new batch for `clientId`: unbilled, billable,
 * finished, and *started* within `range` (whole sessions; you can't bill half).
 */
export function batchCandidates(
  sessions: readonly Session[],
  projects: readonly Project[],
  clientId: string,
  range: TimeRange,
): Session[] {
  const ownProjects = new Set(projects.filter((p) => p.clientId === clientId).map((p) => p.id))
  return sessions
    .filter(
      (s) =>
        s.deletedAt === null &&
        s.billingBatchId === null &&
        s.billable &&
        s.endedAt !== null &&
        ownProjects.has(s.projectId) &&
        s.startedAt >= range.start &&
        s.startedAt < range.end,
    )
    .sort((a, b) => a.startedAt - b.startedAt)
}

export interface BillingSummary {
  count: number
  /** Actual tracked time. */
  ms: number
  /** Time as billed (after rounding). */
  billedMs: number
  /** null when no session has a rate. */
  amount: Money | null
}

/**
 * Totals for sessions billed (or about to be billed) together for one client.
 * Uses each session's recorded rate if billed, otherwise the current rate.
 */
export function billingSummary(
  sessions: readonly Session[],
  projects: readonly Project[],
  client: Client,
  rounding: Rounding,
  now: number,
): BillingSummary {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  let ms = 0
  let billedMs = 0
  let cents = 0
  let hasRate = false
  for (const s of sessions) {
    const duration = sessionDuration(s, now)
    const billed = roundDuration(duration, rounding)
    ms += duration
    billedMs += billed
    const project = projectById.get(s.projectId)
    const rate = s.billedRateCents ?? (project ? effectiveRate(project, client)?.cents : null)
    if (rate != null) {
      hasRate = true
      cents += exactAmountCents(billed, rate)
    }
  }
  return {
    count: sessions.length,
    ms,
    billedMs,
    amount: hasRate ? { currency: client.currency, cents: Math.round(cents) } : null,
  }
}

export interface UnbilledClient extends BillingSummary {
  clientId: string
  /** When the oldest unbilled session started. */
  oldestStartedAt: number
}

/** Unbilled, billable, finished time per client (for the Billing tab), largest first. */
export function unbilledByClient(
  sessions: readonly Session[],
  projects: readonly Project[],
  clients: readonly Client[],
  rounding: Rounding,
  now: number,
): UnbilledClient[] {
  const result: UnbilledClient[] = []
  for (const client of clients) {
    const own = batchCandidates(sessions, projects, client.id, { start: 0, end: Infinity })
    if (own.length === 0) continue
    result.push({
      clientId: client.id,
      oldestStartedAt: own[0]!.startedAt,
      ...billingSummary(own, projects, client, rounding, now),
    })
  }
  return result.sort((a, b) => b.billedMs - a.billedMs)
}

/** Whole calendar days since the batch was billed (0 on the day itself). */
export function daysWaiting(batch: Pick<BillingBatch, 'billedAt'>, now: number): number {
  return Math.max(0, Math.floor((now - batch.billedAt) / 86_400_000))
}

// ---------------------------------------------------------------------------
// Changing batches

export interface NewBatchInput {
  clientId: string
  range: TimeRange
  sessionIds: readonly string[]
  reference: string
  billedAt: number
  note: string
}

/** What a batch action changes: the batch itself and its sessions. */
export interface BatchChanges {
  batch: BillingBatch
  sessions: SessionChange[]
}

/**
 * Create a batch from chosen sessions. Each must be eligible (see batchCandidates);
 * each records its current rate, and the batch records the current rounding.
 */
export function createBatch(
  input: NewBatchInput,
  context: {
    sessions: readonly Session[]
    projects: readonly Project[]
    client: Client
    rounding: Rounding
  },
  ctx: ChangeContext,
): BatchChanges {
  if (input.sessionIds.length === 0) {
    throw new StintError('batch-empty', 'Choose at least one session to bill.')
  }
  const eligible = new Map(
    batchCandidates(context.sessions, context.projects, input.clientId, {
      start: 0,
      end: Infinity,
    }).map((s) => [s.id, s]),
  )
  const chosen = input.sessionIds.map((id) => {
    const s = eligible.get(id)
    if (!s) throw new StintError('not-eligible', 'One of the sessions can no longer be billed.')
    return s
  })
  const batch: BillingBatch = {
    id: (ctx.newId ?? defaultNewId)(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deviceId: ctx.deviceId,
    deletedAt: null,
    clientId: input.clientId,
    rangeStart: input.range.start,
    rangeEnd: input.range.end,
    reference: input.reference.trim(),
    billedAt: input.billedAt,
    paidAt: null,
    note: input.note.trim(),
    roundingMinutes: context.rounding.minutes,
    roundingMode: context.rounding.mode,
  }
  return {
    batch,
    sessions: lockInto(batch, chosen, context.projects, context.client, ctx),
  }
}

/** Add more eligible sessions (same client) to an unpaid batch. */
export function addToBatch(
  batch: BillingBatch,
  sessionIds: readonly string[],
  context: { sessions: readonly Session[]; projects: readonly Project[]; client: Client },
  ctx: ChangeContext,
): SessionChange[] {
  assertUnpaid(batch, 'Mark the batch unpaid before adding to it.')
  const eligible = new Map(
    batchCandidates(context.sessions, context.projects, batch.clientId, {
      start: 0,
      end: Infinity,
    }).map((s) => [s.id, s]),
  )
  const chosen = sessionIds.map((id) => {
    const s = eligible.get(id)
    if (!s) throw new StintError('not-eligible', 'One of the sessions can no longer be billed.')
    return s
  })
  return lockInto(batch, chosen, context.projects, context.client, ctx)
}

function lockInto(
  batch: BillingBatch,
  sessions: readonly Session[],
  projects: readonly Project[],
  client: Client,
  ctx: ChangeContext,
): SessionChange[] {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  return sessions.map((s) => {
    const project = projectById.get(s.projectId)
    const rate = project ? (effectiveRate(project, client)?.cents ?? null) : null
    return update(ctx, s.id, { billingBatchId: batch.id, billedRateCents: rate })
  })
}

/** Take one session out of its batch so it can be edited again. */
export function unlockSession(session: Session, ctx: ChangeContext): SessionChange {
  if (!isLocked(session)) throw new StintError('not-locked', 'This session isn’t billed.')
  return update(ctx, session.id, { billingBatchId: null, billedRateCents: null })
}

/** Un-bill a whole batch: release its sessions and delete the batch. Unpaid batches only. */
export function unbillBatch(
  batch: BillingBatch,
  sessions: readonly Session[],
  ctx: ChangeContext,
): BatchChanges {
  assertUnpaid(batch, 'Mark the batch unpaid before un-billing it.')
  return {
    batch: { ...batch, deletedAt: ctx.now, updatedAt: ctx.now, deviceId: ctx.deviceId },
    sessions: sessions
      .filter((s) => s.billingBatchId === batch.id)
      .map((s) => update(ctx, s.id, { billingBatchId: null, billedRateCents: null })),
  }
}

export interface BatchEdits {
  reference?: string
  note?: string
  billedAt?: number
  /** Set a date to mark paid; null to mark unpaid. */
  paidAt?: number | null
}

export function editBatch(
  batch: BillingBatch,
  edits: BatchEdits,
  ctx: ChangeContext,
): BillingBatch {
  return {
    ...batch,
    ...(edits.reference !== undefined ? { reference: edits.reference.trim() } : {}),
    ...(edits.note !== undefined ? { note: edits.note.trim() } : {}),
    ...(edits.billedAt !== undefined ? { billedAt: edits.billedAt } : {}),
    ...(edits.paidAt !== undefined ? { paidAt: edits.paidAt } : {}),
    updatedAt: ctx.now,
    deviceId: ctx.deviceId,
  }
}

function assertUnpaid(batch: BillingBatch, message: string): void {
  if (batch.paidAt !== null) throw new StintError('batch-paid', message)
}
