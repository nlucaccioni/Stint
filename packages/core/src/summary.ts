// SPDX-License-Identifier: GPL-3.0-or-later
// Per-project numbers for the Projects tab (SPEC.md §7): unbilled billable time,
// recorded time (for delete confirmations), and budget usage. Always derived
// from sessions; a running session counts up to `now`.
import { isLocked } from './billing'
import { budgetUsage, type BudgetUsage } from './budget'
import { sessionDuration } from './time'
import type { Client, Project, Session } from './types'

export interface ProjectSummary {
  /** Billable time not yet in a billing batch (resets when the client is billed). */
  unbilledMs: number
  /** All recorded time, billed or not. */
  recordedMs: number
  sessionCount: number
  /** Any session in a billing batch (the project can't be deleted). */
  hasBilledTime: boolean
  budget: BudgetUsage | null
}

export interface SummaryInput {
  /** Every non-deleted session (deleted ones are skipped anyway). */
  sessions: readonly Session[]
  projects: readonly Project[]
  clients: readonly Client[]
  now: number
  zone: string
}

/** Summaries keyed by project id; every project in `projects` gets one. */
export function projectSummaries(input: SummaryInput): Map<string, ProjectSummary> {
  const byProject = new Map<string, Session[]>()
  for (const s of input.sessions) {
    if (s.deletedAt !== null) continue
    const list = byProject.get(s.projectId)
    if (list) list.push(s)
    else byProject.set(s.projectId, [s])
  }
  const clients = new Map(input.clients.map((c) => [c.id, c]))

  const out = new Map<string, ProjectSummary>()
  for (const project of input.projects) {
    const sessions = byProject.get(project.id) ?? []
    let unbilledMs = 0
    let recordedMs = 0
    let hasBilledTime = false
    for (const s of sessions) {
      const ms = sessionDuration(s, input.now)
      recordedMs += ms
      if (isLocked(s)) hasBilledTime = true
      else if (s.billable) unbilledMs += ms
    }
    const client = clients.get(project.clientId)
    out.set(project.id, {
      unbilledMs,
      recordedMs,
      sessionCount: sessions.length,
      hasBilledTime,
      budget: client
        ? budgetUsage({
            project,
            client,
            sessions,
            now: input.now,
            zone: input.zone,
          })
        : null,
    })
  }
  return out
}
