// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the Local API's `state` and `projects` messages from the database.
// Totals are derived from sessions each time (never stored), using core's math.
import { computeTotals, dayRange, effectiveRate, weekRange, type TimeRange } from '@stint/core'
import type { Db } from '../db/connection'
import { listClients } from '../db/clients'
import { getPreferences } from '../db/preferences'
import { listProjects } from '../db/projects'
import { getRunningSession, listSessions, listUnbilledSessions } from '../db/sessions'
import type { ProjectsMessage, StateMessage } from './protocol'

const ALL_TIME: TimeRange = { start: 0, end: Number.MAX_SAFE_INTEGER }

export function buildState(db: Db, now: number, zone: string): StateMessage {
  const prefs = getPreferences(db)
  const clients = listClients(db)
  const projects = listProjects(db)
  const running = getRunningSession(db)

  const recordedMs = (range: TimeRange) =>
    computeTotals({ sessions: listSessions(db, range), projects, clients, range, now }).ms

  // Unbilled = billable time outside any batch. The running timer isn't in
  // listUnbilledSessions (it only returns finished sessions), so add it here.
  const unbilledSessions = listUnbilledSessions(db)
  const runningUnbilled = running !== null && running.billable && running.billingBatchId === null
  if (runningUnbilled) unbilledSessions.push(running)
  const unbilled = computeTotals({
    sessions: unbilledSessions,
    projects,
    clients,
    range: ALL_TIME,
    now,
  })

  const runningProject = running && projects.find((p) => p.id === running.projectId)
  const runningClient = runningProject && clients.find((c) => c.id === runningProject.clientId)
  return {
    type: 'state',
    running:
      running && runningProject && runningClient
        ? {
            sessionId: running.id,
            projectId: running.projectId,
            clientId: runningProject.clientId,
            startedAt: running.startedAt,
            // Lets clients count unbilled time and amounts up between messages.
            billable: runningUnbilled,
            rate: effectiveRate(runningProject, runningClient),
          }
        : null,
    favorites: prefs.favorites,
    totals: {
      todaySeconds: seconds(recordedMs(dayRange(now, zone))),
      weekSeconds: seconds(recordedMs(weekRange(now, zone, prefs.weekStartsOn))),
      unbilledSeconds: seconds(unbilled.billableMs),
      unbilledAmounts: unbilled.amounts,
    },
  }
}

/** Active projects of active clients, in the user's order (clients, then projects). */
export function buildProjects(db: Db): ProjectsMessage {
  const projects = listProjects(db).filter((p) => !p.archived)
  const list = listClients(db)
    .filter((c) => !c.archived)
    .flatMap((client) =>
      projects
        .filter((p) => p.clientId === client.id)
        .map((p) => ({
          id: p.id,
          clientId: client.id,
          name: p.name,
          clientName: client.name,
          color: client.color,
        })),
    )
  return { type: 'projects', list }
}

function seconds(ms: number): number {
  return Math.floor(ms / 1000)
}
