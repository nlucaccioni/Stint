// SPDX-License-Identifier: GPL-3.0-or-later
// Timer actions (SPEC.md §6 "Timers"). The running timer is the one session with
// endedAt = null. Every action takes that session (or null) and returns changes.
import { insert, update, type ChangeContext, type SessionChange } from './changes'
import { StintError } from './errors'
import type { Project, Session } from './types'

type TimerProject = Pick<Project, 'id' | 'billableByDefault'>

function startNew(project: TimerProject, ctx: ChangeContext): SessionChange {
  return insert(ctx, {
    projectId: project.id,
    startedAt: ctx.now,
    endedAt: null,
    note: '',
    billable: project.billableByDefault,
    billingBatchId: null,
    billedRateCents: null,
    source: 'timer',
  })
}

/**
 * Start timing a project. If another project is running, it stops at the same
 * instant the new one starts. Starting the project that's already running does nothing.
 */
export function start(
  running: Session | null,
  project: TimerProject,
  ctx: ChangeContext,
): SessionChange[] {
  if (running?.projectId === project.id) return []
  return [...stop(running, ctx), startNew(project, ctx)]
}

/** Start/switch to a project, or stop it if it's the one running (hotkeys, keypad, start buttons). */
export function toggle(
  running: Session | null,
  project: TimerProject,
  ctx: ChangeContext,
): SessionChange[] {
  if (running?.projectId === project.id) return stop(running, ctx)
  return start(running, project, ctx)
}

/**
 * Stop the running timer now. Does nothing if nothing is running.
 * A timer stopped in the same instant it started (a double press, or the clock
 * stepping backwards) recorded no time, so it's deleted rather than saved empty.
 */
export function stop(running: Session | null, ctx: ChangeContext): SessionChange[] {
  if (!running) return []
  if (ctx.now <= running.startedAt) return [update(ctx, running.id, { deletedAt: ctx.now })]
  return [update(ctx, running.id, { endedAt: ctx.now })]
}

/** "Stop at…": end the running timer at an earlier time. */
export function stopAt(running: Session | null, at: number, ctx: ChangeContext): SessionChange[] {
  if (!running) throw new StintError('not-running', 'No timer is running.')
  if (at <= running.startedAt || at > ctx.now) {
    throw new StintError('stop-out-of-range', 'Stop time must be between the start time and now.')
  }
  return [update(ctx, running.id, { endedAt: at })]
}

/**
 * What to do with time the user was away:
 * - keep: count it.
 * - discard: end the session when idle began.
 * - discard-continue: end it when idle began and start a fresh session now on the same project.
 */
export type IdleChoice = 'keep' | 'discard' | 'discard-continue'

export function resolveIdle(
  running: Session | null,
  idleStartedAt: number,
  choice: IdleChoice,
  ctx: ChangeContext,
): SessionChange[] {
  if (!running || choice === 'keep') return []

  // If the timer was started after idle began, the whole session is idle time.
  const close =
    idleStartedAt <= running.startedAt
      ? update(ctx, running.id, { deletedAt: ctx.now })
      : update(ctx, running.id, { endedAt: Math.min(idleStartedAt, ctx.now) })

  if (choice === 'discard') return [close]
  return [close, startNew({ id: running.projectId, billableByDefault: running.billable }, ctx)]
}
