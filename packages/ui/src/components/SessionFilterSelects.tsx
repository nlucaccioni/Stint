// SPDX-License-Identifier: GPL-3.0-or-later
// The Client/Project and Billing dropdowns, shared by the Time and Totals tabs
// (SPEC.md §6 "Time tab").
import { useMemo } from 'react'
import type { BillingFilter, Client, Project, SessionFilter } from '@stint/core'
import { Select, type SelectOption } from './Select'
import styles from './SessionFilterSelects.module.css'

const BILLING_OPTIONS: SelectOption<BillingFilter>[] = [
  { value: 'all', label: 'All Billing' },
  { value: 'billable', label: 'Billable' },
  { value: 'nonBillable', label: 'Non-Billable' },
  { value: 'unbilled', label: 'Unbilled' },
  { value: 'billed', label: 'Billed' },
  { value: 'paid', label: 'Paid' },
]

export interface SessionFilterSelectsProps {
  filter: SessionFilter
  onChange: (filter: SessionFilter) => void
  clients: readonly Client[]
  projects: readonly Project[]
}

export function SessionFilterSelects({
  filter,
  onChange,
  clients,
  projects,
}: SessionFilterSelectsProps) {
  // All Clients, then each client with its projects indented under it.
  const scopeOptions = useMemo(() => {
    const options: SelectOption<string>[] = [{ value: 'all', label: 'All Clients' }]
    for (const c of clients) {
      options.push({ value: `client:${c.id}`, label: c.name })
      for (const p of projects) {
        if (p.clientId === c.id) {
          options.push({ value: `project:${p.id}`, label: p.name, indent: true })
        }
      }
    }
    return options
  }, [clients, projects])
  const scopeValue = filter.scope.kind === 'all' ? 'all' : `${filter.scope.kind}:${filter.scope.id}`

  return (
    <div className={styles.selects}>
      <Select
        aria-label="Client or Project"
        className={styles.scope}
        value={scopeValue}
        options={scopeOptions}
        onChange={(value) => {
          const [kind, id] = value.split(':') as ['client' | 'project', string]
          onChange({ ...filter, scope: value === 'all' ? { kind: 'all' } : { kind, id } })
        }}
      />
      <Select
        aria-label="Billing"
        className={styles.billing}
        value={filter.billing}
        options={BILLING_OPTIONS}
        onChange={(billing) => onChange({ ...filter, billing })}
      />
    </div>
  )
}
