// SPDX-License-Identifier: GPL-3.0-or-later
import type { BillingBatch, Client, Project, Session } from '@stint/core'
import { defineTable } from './table'

const syncColumns = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deviceId: 'device_id',
  deletedAt: 'deleted_at',
} as const

export const clientsTable = defineTable<Client>({
  name: 'clients',
  columns: {
    ...syncColumns,
    name: 'name',
    color: 'color',
    hourlyRateCents: 'hourly_rate_cents',
    currency: 'currency',
    archived: 'archived',
  },
  booleans: ['archived'],
})

export const projectsTable = defineTable<Project>({
  name: 'projects',
  columns: {
    ...syncColumns,
    clientId: 'client_id',
    name: 'name',
    color: 'color',
    hourlyRateCents: 'hourly_rate_cents',
    billableByDefault: 'billable_by_default',
    archived: 'archived',
  },
  booleans: ['billableByDefault', 'archived'],
})

export const sessionsTable = defineTable<Session>({
  name: 'sessions',
  columns: {
    ...syncColumns,
    projectId: 'project_id',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    note: 'note',
    billable: 'billable',
    billingBatchId: 'billing_batch_id',
    billedRateCents: 'billed_rate_cents',
    source: 'source',
  },
  booleans: ['billable'],
})

export const batchesTable = defineTable<BillingBatch>({
  name: 'billing_batches',
  columns: {
    ...syncColumns,
    clientId: 'client_id',
    rangeStart: 'range_start',
    rangeEnd: 'range_end',
    reference: 'reference',
    billedAt: 'billed_at',
    paidAt: 'paid_at',
    note: 'note',
    roundingMinutes: 'rounding_minutes',
    roundingMode: 'rounding_mode',
  },
  booleans: [],
})
