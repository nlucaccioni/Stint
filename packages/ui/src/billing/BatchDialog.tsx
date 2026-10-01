// SPDX-License-Identifier: GPL-3.0-or-later
// One billing batch: its sessions, details, paid status, and the deliberate
// actions that change what's billed (unlock one session, add more, un-bill all).
import { useState, type FormEvent } from 'react'
import { LockOpen } from 'lucide-react'
import {
  batchCandidates,
  billingSummary,
  formatClock,
  fromLocalParts,
  toLocalParts,
  type BatchEdits,
  type BillingBatch,
  type Client,
  type Project,
  type Session,
} from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import { DeleteAction } from '../catalog/DeleteAction'
import { useNow } from '../timer/useNow'
import { amountLabel, formatDay } from './format'
import { SessionLine } from './SessionLine'
import styles from './BillingView.module.css'

export interface BatchDialogActions {
  onUpdateBatch: (id: string, edits: BatchEdits) => Promise<unknown>
  onAddToBatch: (id: string, sessionIds: string[]) => Promise<unknown>
  onUnlockSession: (sessionId: string) => Promise<unknown>
  onUnbillBatch: (id: string) => Promise<unknown>
}

export interface BatchDialogProps extends BatchDialogActions {
  batch: BillingBatch
  client: Client
  projects: readonly Project[]
  /** Sessions in this batch. */
  sessions: readonly Session[]
  unbilledSessions: readonly Session[]
  zone: string
  onClose: () => void
}

export function BatchDialog(props: BatchDialogProps) {
  const { batch, client, projects, sessions, zone } = props
  const now = useNow(true, 60_000)
  const today = toLocalParts(now, zone).date
  const isPaid = batch.paidAt !== null
  const rounding = { minutes: batch.roundingMinutes, mode: batch.roundingMode }
  const summary = billingSummary(sessions, projects, client, rounding, now)
  const projectById = new Map(projects.map((p) => [p.id, p]))

  const [reference, setReference] = useState(batch.reference)
  const [note, setNote] = useState(batch.note)
  const [billedOn, setBilledOn] = useState(toLocalParts(batch.billedAt, zone).date)
  const [paidOn, setPaidOn] = useState(today)
  const [unlocking, setUnlocking] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { saving, error, setError, run } = useSubmit()

  const day = (date: string) => {
    const ms = fromLocalParts(date, '12:00', zone)
    if (Number.isNaN(ms)) throw new Error('Choose a date.')
    return ms
  }

  function save(e: FormEvent) {
    e.preventDefault()
    void run(() =>
      props.onUpdateBatch(batch.id, { reference, note, billedAt: day(billedOn) }).then(() => {}),
    )
  }

  return (
    <Dialog
      title={`${client.name}${batch.reference ? ` · ${batch.reference}` : ''}`}
      onClose={props.onClose}
    >
      <form className={formStyles.form} onSubmit={save}>
        <p className={formStyles.note}>
          {isPaid
            ? `Paid on ${formatDay(batch.paidAt!, zone)}.`
            : `Billed ${formatDay(batch.billedAt, zone)}, waiting for payment.`}
          {batch.roundingMinutes > 0 &&
            ` Rounded ${batch.roundingMode} to ${batch.roundingMinutes} min per session.`}
        </p>

        <ul className={styles.sessions} aria-label="Sessions in this batch">
          {sessions.map((s) => (
            <SessionLine
              key={s.id}
              session={s}
              project={projectById.get(s.projectId)}
              zone={zone}
              now={now}
              after={
                unlocking === s.id ? (
                  <>
                    <Button size="sm" onClick={() => setUnlocking(null)}>
                      Keep
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        void run(() => props.onUnlockSession(s.id).then(() => setUnlocking(null)))
                      }
                    >
                      Unlock
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Remove from this batch so it can be edited"
                    aria-label="Unlock"
                    onClick={() => setUnlocking(s.id)}
                  >
                    <LockOpen size={14} />
                  </Button>
                )
              }
            />
          ))}
        </ul>
        {unlocking && (
          <p className={formStyles.note}>
            Unlocking removes this session from the batch so it can be edited. It becomes unbilled.
          </p>
        )}
        <div className={styles.summary}>
          <span>
            {summary.count} {summary.count === 1 ? 'session' : 'sessions'}
          </span>
          <strong>
            {formatClock(summary.billedMs)} · {amountLabel(summary.amount)}
          </strong>
        </div>

        {!isPaid && adding && (
          <AddSessions
            batch={batch}
            client={client}
            projects={projects}
            unbilledSessions={props.unbilledSessions}
            zone={zone}
            now={now}
            onAdd={(ids) =>
              run(() => props.onAddToBatch(batch.id, ids).then(() => setAdding(false)))
            }
            onCancel={() => setAdding(false)}
          />
        )}

        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field label="Reference">
              <input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <Field label="Billed on">
            <input
              type="date"
              value={billedOn}
              onChange={(e) => setBilledOn(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>

        <div className={styles.paidRow}>
          {isPaid ? (
            <Button
              onClick={() =>
                void run(() => props.onUpdateBatch(batch.id, { paidAt: null }).then(() => {}))
              }
            >
              Mark unpaid
            </Button>
          ) : (
            <>
              <Field label="Paid on">
                <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Button
                variant="primary"
                onClick={() =>
                  void run(() =>
                    props.onUpdateBatch(batch.id, { paidAt: day(paidOn) }).then(() => {}),
                  )
                }
              >
                Mark paid
              </Button>
              {!adding && <Button onClick={() => setAdding(true)}>Add sessions…</Button>}
            </>
          )}
        </div>

        {!isPaid && (
          <DeleteAction
            kind="session"
            onError={setError}
            deletion={{
              allowed: true,
              question: 'Un-bill this batch? All its sessions become unbilled again.',
              onDelete: async () => {
                await props.onUnbillBatch(batch.id)
                props.onClose()
              },
            }}
            label="Un-bill batch…"
            confirmLabel="Un-bill"
            warning=""
          />
        )}

        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={formStyles.actions}>
          <Button onClick={props.onClose}>Close</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            Save details
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function AddSessions(props: {
  batch: BillingBatch
  client: Client
  projects: readonly Project[]
  unbilledSessions: readonly Session[]
  zone: string
  now: number
  onAdd: (ids: string[]) => void
  onCancel: () => void
}) {
  const candidates = batchCandidates(props.unbilledSessions, props.projects, props.client.id, {
    start: 0,
    end: Infinity,
  })
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const projectById = new Map(props.projects.map((p) => [p.id, p]))
  if (candidates.length === 0) {
    return (
      <p className={formStyles.note}>
        No other unbilled time for {props.client.name}.{' '}
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          OK
        </Button>
      </p>
    )
  }
  return (
    <>
      <ul className={styles.sessions} aria-label="Unbilled sessions to add">
        {candidates.map((s) => (
          <SessionLine
            key={s.id}
            session={s}
            project={projectById.get(s.projectId)}
            zone={props.zone}
            now={props.now}
            before={
              <input
                type="checkbox"
                aria-label="Add"
                checked={picked.has(s.id)}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(s.id)
                  else next.delete(s.id)
                  setPicked(next)
                }}
              />
            }
          />
        ))}
      </ul>
      <div className={formStyles.actions}>
        <Button size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={picked.size === 0}
          onClick={() => props.onAdd([...picked])}
        >
          Add {picked.size || ''} to batch
        </Button>
      </div>
    </>
  )
}
