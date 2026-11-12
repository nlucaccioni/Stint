// SPDX-License-Identifier: GPL-3.0-or-later
// One billing batch: what it billed per project, its sessions, details, paid
// status, and the deliberate actions that change what's billed (unlock one
// session, add more, un-bill all).
import { useState, type FormEvent } from 'react'
import { LockOpen } from 'lucide-react'
import {
  batchCandidates,
  billingLines,
  billingSummary,
  formatClock,
  formatMoney,
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
import { DateInput } from '../components/DateInput'
import { Field } from '../components/Field'
import { useDragTick } from '../components/useDragTick'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import { DeleteAction } from '../catalog/DeleteAction'
import { useNow } from '../timer/useNow'
import { amountLabel, formatDay, roundingLabel } from './format'
import { SessionLine, SessionTick } from './SessionLine'
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
  const rounding = {
    minutes: batch.roundingMinutes,
    mode: batch.roundingMode,
    scope: batch.roundingScope,
  }
  const summary = billingSummary(sessions, projects, client, rounding, now, zone)
  const lines = billingLines(sessions, projects, client, rounding, now, zone)
  const projectById = new Map(projects.map((p) => [p.id, p]))
  // A batch for one project: shown in the title, and only that project's time can be added.
  const onlyProject =
    sessions.length > 0 && sessions.every((s) => s.projectId === sessions[0]!.projectId)
      ? projectById.get(sessions[0]!.projectId)
      : undefined

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
      title={[client.name, onlyProject?.name, batch.reference || undefined]
        .filter(Boolean)
        .join(' · ')}
      onClose={props.onClose}
    >
      <form className={formStyles.form} onSubmit={save}>
        <p className={formStyles.note}>
          {isPaid
            ? `Paid on ${formatDay(batch.paidAt!, zone)}.`
            : `Billed ${formatDay(batch.billedAt, zone)}, waiting for payment.`}
          {batch.roundingMinutes > 0 && ` ${capitalize(roundingLabel(rounding))}.`}
        </p>

        <section className={styles.billedFor} aria-label="Billed For">
          <h3 className={styles.billedForTitle}>Billed For</h3>
          <table className={styles.lines}>
            <tbody>
              {lines.map((line) => (
                <tr key={`${line.projectId}|${line.rateCents}`}>
                  <th scope="row">{projectById.get(line.projectId)?.name ?? 'Unknown Project'}</th>
                  <td className={styles.muted}>
                    {line.rateCents === null
                      ? 'No Rate'
                      : `${formatMoney(line.rateCents, client.currency)}/hr`}
                  </td>
                  <td className={styles.num}>{formatClock(line.billedMs)}</td>
                  <td className={styles.num}>
                    {line.amountCents === null
                      ? '—'
                      : formatMoney(line.amountCents, client.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className={styles.muted}>
                  {summary.count} {summary.count === 1 ? 'session' : 'sessions'}
                </td>
                <td className={styles.num}>{formatClock(summary.billedMs)}</td>
                <td className={styles.num}>{amountLabel(summary.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <ul className={styles.sessions} aria-label="Sessions in This Batch">
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
        {!isPaid && adding && (
          <AddSessions
            batch={batch}
            client={client}
            project={onlyProject}
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
          <Field label="Billed On">
            <DateInput value={billedOn} onChange={setBilledOn} />
          </Field>
        </div>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>

        {!isPaid && (
          <div className={styles.paidRow}>
            <Field label="Paid On">
              <DateInput value={paidOn} onChange={setPaidOn} />
            </Field>
            {/* Same height as the date box, so the buttons sit centered on it. */}
            {!adding && (
              <div className={styles.paidActions}>
                <Button onClick={() => setAdding(true)}>Add Sessions</Button>
              </div>
            )}
            <div className={`${styles.paidActions} ${styles.unbill}`}>
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
                label="Un-bill Batch"
                confirmLabel="Un-bill"
                warning=""
              />
            </div>
          </div>
        )}

        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        {/* Mark Paid / Unpaid on the left, the dialog's own actions on the right. */}
        <div className={styles.dialogActions}>
          {isPaid ? (
            <Button
              onClick={() =>
                void run(() => props.onUpdateBatch(batch.id, { paidAt: null }).then(() => {}))
              }
            >
              Mark Unpaid
            </Button>
          ) : (
            <Button
              onClick={() =>
                void run(() =>
                  props.onUpdateBatch(batch.id, { paidAt: day(paidOn) }).then(() => {}),
                )
              }
            >
              Mark Paid
            </Button>
          )}
          <div className={formStyles.actions}>
            <Button onClick={props.onClose}>Close</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              Save Details
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

function AddSessions(props: {
  batch: BillingBatch
  client: Client
  /** Set for a one-project batch: only that project's time is offered. */
  project: Project | undefined
  projects: readonly Project[]
  unbilledSessions: readonly Session[]
  zone: string
  now: number
  onAdd: (ids: string[]) => void
  onCancel: () => void
}) {
  const candidates = batchCandidates(
    props.unbilledSessions,
    props.projects,
    props.client.id,
    { start: 0, end: Infinity },
    props.project?.id,
  )
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const projectById = new Map(props.projects.map((p) => [p.id, p]))
  function pick(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const drag = useDragTick((id) => picked.has(id), pick)
  if (candidates.length === 0) {
    return (
      <p className={formStyles.note}>
        No other unbilled time for {props.project?.name ?? props.client.name}.{' '}
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          OK
        </Button>
      </p>
    )
  }
  return (
    <>
      <ul className={styles.sessions} aria-label="Unbilled Sessions to Add">
        {candidates.map((s) => (
          <SessionLine
            key={s.id}
            session={s}
            project={projectById.get(s.projectId)}
            zone={props.zone}
            now={props.now}
            onPointerEnter={() => drag.enter(s.id)}
            before={
              <SessionTick
                label="Add"
                checked={picked.has(s.id)}
                onToggle={(on) => pick(s.id, on)}
                onPointerDown={(e) => drag.start(s.id, e)}
                onClick={drag.onClick}
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

function capitalize(text: string): string {
  return text[0]!.toUpperCase() + text.slice(1)
}
