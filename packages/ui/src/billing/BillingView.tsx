// SPDX-License-Identifier: GPL-3.0-or-later
// The Billing tab: what's unbilled per client, batches waiting for payment, and
// paid history. All figures are derived from sessions (core), never stored.
import { useMemo, useState, type CSSProperties } from 'react'
import {
  billingSummary,
  daysWaiting,
  formatClock,
  unbilledByClient,
  type BillingBatch,
  type Client,
  type Project,
  type Rounding,
  type Session,
} from '@stint/core'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import tableStyles from '../components/Table.module.css'
import { useNow } from '../timer/useNow'
import { BatchDialog, type BatchDialogActions } from './BatchDialog'
import { CreateBatchDialog, type NewBatchValues } from './CreateBatchDialog'
import { amountLabel, formatDay } from './format'
import styles from './BillingView.module.css'

export interface BillingViewProps extends BatchDialogActions {
  clients: readonly Client[]
  projects: readonly Project[]
  batches: readonly BillingBatch[]
  /** Unbilled, billable, finished sessions. */
  unbilledSessions: readonly Session[]
  /** Sessions in any batch. */
  billedSessions: readonly Session[]
  rounding: Rounding
  zone: string
  onCreateBatch: (values: NewBatchValues) => Promise<unknown>
}

type Open = { kind: 'create'; clientId: string } | { kind: 'batch'; batchId: string } | null

export function BillingView(props: BillingViewProps) {
  const { clients, projects, batches, unbilledSessions, billedSessions, rounding, zone } = props
  const now = useNow(true, 60_000)
  const [open, setOpen] = useState<Open>(null)
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  const unbilled = useMemo(
    () => unbilledByClient(unbilledSessions, projects, clients, rounding, now),
    [unbilledSessions, projects, clients, rounding, now],
  )

  // Each batch's figures, using the rounding it was created with.
  const summaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof billingSummary>>()
    for (const batch of batches) {
      const client = clientById.get(batch.clientId)
      if (!client) continue
      const own = billedSessions.filter((s) => s.billingBatchId === batch.id)
      map.set(
        batch.id,
        billingSummary(
          own,
          projects,
          client,
          { minutes: batch.roundingMinutes, mode: batch.roundingMode },
          now,
        ),
      )
    }
    return map
  }, [batches, billedSessions, projects, clientById, now])

  const outstanding = batches.filter((b) => b.paidAt === null)
  const paid = batches.filter((b) => b.paidAt !== null).sort((a, b) => b.paidAt! - a.paidAt!)
  const batchOpen = open?.kind === 'batch' ? batches.find((b) => b.id === open.batchId) : undefined

  return (
    <section className={styles.view}>
      <h1 className={styles.heading}>Billing</h1>

      <Card
        compact
        title="Unbilled"
        empty={unbilled.length === 0 && 'Everything billable has been billed.'}
      >
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Since</th>
              <th scope="col" className={tableStyles.num}>
                Time
              </th>
              <th scope="col" className={tableStyles.num}>
                Amount
              </th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {unbilled.map((row) => {
              const client = clientById.get(row.clientId)
              return (
                <tr key={row.clientId}>
                  <th scope="row">
                    <ClientName client={client} />
                  </th>
                  <td className={styles.muted}>{formatDay(row.oldestStartedAt, zone)}</td>
                  <td className={tableStyles.num}>{formatClock(row.billedMs)}</td>
                  <td className={tableStyles.num}>{amountLabel(row.amount)}</td>
                  <td className={tableStyles.actions}>
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() => setOpen({ kind: 'create', clientId: row.clientId })}
                    >
                      Create Batch
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card
        compact
        title="Waiting for Payment"
        empty={outstanding.length === 0 && 'Nothing outstanding.'}
      >
        <BatchTable
          batches={outstanding}
          summaries={summaries}
          clientById={clientById}
          zone={zone}
          dateColumn={(b) => {
            const days = daysWaiting(b, now)
            return `${formatDay(b.billedAt, zone)} · ${days === 1 ? '1 day' : `${days} days`}`
          }}
          dateHeading="Billed · Waiting"
          onOpen={(b) => setOpen({ kind: 'batch', batchId: b.id })}
        />
      </Card>

      <Card compact title="Paid" empty={paid.length === 0 && 'No paid batches yet.'}>
        <BatchTable
          batches={paid}
          summaries={summaries}
          clientById={clientById}
          zone={zone}
          dateColumn={(b) => formatDay(b.paidAt!, zone)}
          dateHeading="Paid On"
          onOpen={(b) => setOpen({ kind: 'batch', batchId: b.id })}
        />
      </Card>

      {open?.kind === 'create' && clientById.get(open.clientId) && (
        <CreateBatchDialog
          client={clientById.get(open.clientId)!}
          projects={projects}
          unbilledSessions={unbilledSessions}
          rounding={rounding}
          zone={zone}
          onCreate={props.onCreateBatch}
          onClose={() => setOpen(null)}
        />
      )}
      {batchOpen && clientById.get(batchOpen.clientId) && (
        <BatchDialog
          batch={batchOpen}
          client={clientById.get(batchOpen.clientId)!}
          projects={projects}
          sessions={billedSessions.filter((s) => s.billingBatchId === batchOpen.id)}
          unbilledSessions={unbilledSessions}
          zone={zone}
          onUpdateBatch={props.onUpdateBatch}
          onAddToBatch={props.onAddToBatch}
          onUnlockSession={props.onUnlockSession}
          onUnbillBatch={props.onUnbillBatch}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}

function BatchTable(props: {
  batches: readonly BillingBatch[]
  summaries: ReadonlyMap<string, ReturnType<typeof billingSummary>>
  clientById: ReadonlyMap<string, Client>
  zone: string
  dateHeading: string
  dateColumn: (batch: BillingBatch) => string
  onOpen: (batch: BillingBatch) => void
}) {
  return (
    <table className={tableStyles.table}>
      <thead>
        <tr>
          <th scope="col">Client</th>
          <th scope="col">Reference</th>
          <th scope="col">{props.dateHeading}</th>
          <th scope="col" className={tableStyles.num}>
            Time
          </th>
          <th scope="col" className={tableStyles.num}>
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {props.batches.map((b) => {
          const sum = props.summaries.get(b.id)
          return (
            <tr
              key={b.id}
              className={tableStyles.clickable}
              tabIndex={0}
              onClick={() => props.onOpen(b)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && props.onOpen(b)}
            >
              <th scope="row">
                <ClientName client={props.clientById.get(b.clientId)} />
              </th>
              <td className={styles.muted}>{b.reference || 'No Reference'}</td>
              <td className={styles.muted}>{props.dateColumn(b)}</td>
              <td className={tableStyles.num}>{sum ? formatClock(sum.billedMs) : '—'}</td>
              <td className={tableStyles.num}>{amountLabel(sum?.amount ?? null)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ClientName({ client }: { client: Client | undefined }) {
  return (
    <span className={styles.name}>
      <span
        className={styles.swatch}
        style={{ '--client-color': client?.color } as CSSProperties}
        aria-hidden
      />
      {client?.name ?? 'Unknown Client'}
    </span>
  )
}
