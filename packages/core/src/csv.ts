// SPDX-License-Identifier: GPL-3.0-or-later
// CSV export of sessions (SPEC.md §6). RFC 4180 quoting, CRLF line endings.
import { format } from 'date-fns'
import { tz } from '@date-fns/tz'
import { billingStatus } from './billing'
import { formatDecimalHours, formatHoursMinutes } from './format'
import { sessionDuration } from './time'
import type { BillingBatch, Client, Project, Session } from './types'

export interface CsvInput {
  sessions: readonly Session[]
  projects: readonly Project[]
  clients: readonly Client[]
  batches: readonly BillingBatch[]
  /** IANA time zone for the date/time columns. */
  zone: string
  now: number
}

const HEADER = [
  'Date',
  'Start',
  'End',
  'Duration',
  'Hours',
  'Client',
  'Project',
  'Note',
  'Billable',
  'Status',
  'Batch reference',
]

export function sessionsToCsv(input: CsvInput): string {
  const projects = new Map(input.projects.map((p) => [p.id, p]))
  const clients = new Map(input.clients.map((c) => [c.id, c]))
  const batches = new Map(input.batches.map((b) => [b.id, b]))
  const opts = { in: tz(input.zone) }

  const rows = input.sessions
    .filter((s) => s.deletedAt === null)
    .toSorted((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const project = projects.get(s.projectId)
      const client = project && clients.get(project.clientId)
      const ms = sessionDuration(s, input.now)
      return [
        format(s.startedAt, 'yyyy-MM-dd', opts),
        format(s.startedAt, 'HH:mm', opts),
        s.endedAt === null ? '' : format(s.endedAt, 'HH:mm', opts),
        formatHoursMinutes(ms),
        formatDecimalHours(ms),
        text(client?.name ?? ''),
        text(project?.name ?? ''),
        text(s.note),
        s.billable ? 'yes' : 'no',
        billingStatus(s, batches),
        text(s.billingBatchId ? (batches.get(s.billingBatchId)?.reference ?? '') : ''),
      ]
    })

  return [HEADER, ...rows].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n'
}

/**
 * User-entered text. Spreadsheet apps run cells starting with = + - @ (or tab/CR)
 * as formulas, so prefix those with an apostrophe to keep them as plain text.
 */
function text(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}
