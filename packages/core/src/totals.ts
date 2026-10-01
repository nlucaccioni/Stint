// SPDX-License-Identifier: GPL-3.0-or-later
// Totals are always computed from sessions (SPEC.md §6 "Totals & reporting").
// Sessions crossing the range edges only count the part inside the range, and a
// running session counts up to `now`.
import { effectiveRate, exactAmountCents } from './rates'
import { clippedDuration, daysInRange } from './time'
import type { Client, Money, Project, Session, TimeRange } from './types'

export interface GroupTotal {
  ms: number
  billableMs: number
  /** Billable amounts, one entry per currency. Never summed across currencies. */
  amounts: Money[]
}

export interface ClientTotal extends GroupTotal {
  clientId: string
}

export interface ProjectTotal extends GroupTotal {
  projectId: string
  clientId: string
}

export interface Totals extends GroupTotal {
  /** Largest first. */
  byClient: ClientTotal[]
  /** Largest first. */
  byProject: ProjectTotal[]
}

export interface TotalsInput {
  sessions: readonly Session[]
  /** Include archived projects/clients; sessions whose project isn't found are skipped. */
  projects: readonly Project[]
  clients: readonly Client[]
  range: TimeRange
  now: number
}

/** Running sums; cents stay unrounded until the end. */
class Accumulator {
  ms = 0
  billableMs = 0
  private cents = new Map<string, number>()

  add(ms: number, billable: boolean, rate: Money | null): void {
    this.ms += ms
    if (!billable) return
    this.billableMs += ms
    if (rate) {
      this.cents.set(
        rate.currency,
        (this.cents.get(rate.currency) ?? 0) + exactAmountCents(ms, rate.cents),
      )
    }
  }

  result(): GroupTotal {
    const amounts = [...this.cents]
      .map(([currency, cents]) => ({ currency, cents: Math.round(cents) }))
      .sort((a, b) => a.currency.localeCompare(b.currency))
    return { ms: this.ms, billableMs: this.billableMs, amounts }
  }
}

export function computeTotals(input: TotalsInput): Totals {
  const projects = new Map(input.projects.map((p) => [p.id, p]))
  const clients = new Map(input.clients.map((c) => [c.id, c]))

  const all = new Accumulator()
  const byClient = new Map<string, Accumulator>()
  const byProject = new Map<string, Accumulator>()

  for (const session of input.sessions) {
    if (session.deletedAt !== null) continue
    const project = projects.get(session.projectId)
    const client = project && clients.get(project.clientId)
    if (!project || !client) continue

    const ms = clippedDuration(session, input.range, input.now)
    if (ms === 0) continue

    // Billed sessions keep the rate they were billed at, so old invoices never change.
    const rate =
      session.billedRateCents !== null
        ? { currency: client.currency, cents: session.billedRateCents }
        : effectiveRate(project, client)
    all.add(ms, session.billable, rate)
    getOrCreate(byClient, client.id).add(ms, session.billable, rate)
    getOrCreate(byProject, project.id).add(ms, session.billable, rate)
  }

  return {
    ...all.result(),
    byClient: [...byClient]
      .map(([clientId, acc]) => ({ clientId, ...acc.result() }))
      .sort((a, b) => b.ms - a.ms),
    byProject: [...byProject]
      .map(([projectId, acc]) => ({
        projectId,
        clientId: projects.get(projectId)!.clientId,
        ...acc.result(),
      }))
      .sort((a, b) => b.ms - a.ms),
  }
}

export interface DayTotal extends TimeRange {
  ms: number
}

/** Time per local day across `range` (days with no time are included as 0). */
export function dailyTotals(
  sessions: readonly Session[],
  range: TimeRange,
  zone: string,
  now: number,
): DayTotal[] {
  const live = sessions.filter((s) => s.deletedAt === null)
  return daysInRange(range, zone).map((day) => {
    const clipped = { start: Math.max(day.start, range.start), end: Math.min(day.end, range.end) }
    const ms = live.reduce((sum, s) => sum + clippedDuration(s, clipped, now), 0)
    return { ...day, ms }
  })
}

function getOrCreate(map: Map<string, Accumulator>, key: string): Accumulator {
  let acc = map.get(key)
  if (!acc) map.set(key, (acc = new Accumulator()))
  return acc
}
