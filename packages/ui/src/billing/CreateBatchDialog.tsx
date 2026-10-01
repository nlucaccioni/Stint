// SPDX-License-Identifier: GPL-3.0-or-later
// Bill a client: pick a date range, untick anything to leave out, add a reference.
import { useMemo, useState, type FormEvent } from 'react'
import {
  batchCandidates,
  billingSummary,
  dayRange,
  formatClock,
  fromLocalParts,
  toLocalParts,
  type Client,
  type Project,
  type Rounding,
  type Session,
} from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import { useNow } from '../timer/useNow'
import { amountLabel } from './format'
import { SessionLine } from './SessionLine'
import styles from './BillingView.module.css'

export interface NewBatchValues {
  clientId: string
  rangeStart: number
  rangeEnd: number
  sessionIds: string[]
  reference: string
  billedAt: number
  note: string
}

export interface CreateBatchDialogProps {
  client: Client
  projects: readonly Project[]
  unbilledSessions: readonly Session[]
  rounding: Rounding
  zone: string
  onCreate: (values: NewBatchValues) => Promise<unknown>
  onClose: () => void
}

export function CreateBatchDialog(props: CreateBatchDialogProps) {
  const { client, projects, unbilledSessions, rounding, zone } = props
  const now = useNow(true, 60_000)
  const today = toLocalParts(now, zone).date

  // Default range: from the oldest unbilled session for this client to today.
  const [from, setFrom] = useState(() => {
    const all = batchCandidates(unbilledSessions, projects, client.id, { start: 0, end: Infinity })
    return all.length ? toLocalParts(all[0]!.startedAt, zone).date : today
  })
  const [to, setTo] = useState(today)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [reference, setReference] = useState('')
  const [billedOn, setBilledOn] = useState(today)
  const [note, setNote] = useState('')
  const { saving, error, run } = useSubmit()

  const range = useMemo(() => {
    const start = fromLocalParts(from, '12:00', zone)
    const end = fromLocalParts(to, '12:00', zone)
    if (Number.isNaN(start) || Number.isNaN(end)) return null
    return { start: dayRange(start, zone).start, end: dayRange(end, zone).end }
  }, [from, to, zone])

  const candidates = useMemo(
    () => (range ? batchCandidates(unbilledSessions, projects, client.id, range) : []),
    [unbilledSessions, projects, client.id, range],
  )
  const chosen = candidates.filter((s) => !excluded.has(s.id))
  const summary = billingSummary(chosen, projects, client, rounding, now)
  const projectById = new Map(projects.map((p) => [p.id, p]))

  function toggle(id: string, include: boolean) {
    const next = new Set(excluded)
    if (include) next.delete(id)
    else next.add(id)
    setExcluded(next)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      if (!range) throw new Error('Choose a valid date range.')
      const billedAt = fromLocalParts(billedOn, '12:00', zone)
      if (Number.isNaN(billedAt)) throw new Error('Choose the date you billed.')
      await props.onCreate({
        clientId: client.id,
        rangeStart: range.start,
        rangeEnd: range.end,
        sessionIds: chosen.map((s) => s.id),
        reference,
        billedAt,
        note,
      })
      props.onClose()
    })
  }

  return (
    <Dialog title={`Bill ${client.name}`} onClose={props.onClose}>
      <form className={formStyles.form} onSubmit={submit}>
        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field label="From">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </Field>
          </div>
          <div className={formStyles.grow}>
            <Field label="To">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className={formStyles.note}>No unbilled time for {client.name} in this range.</p>
        ) : (
          <ul className={styles.sessions} aria-label="Sessions to bill">
            {candidates.map((s) => (
              <SessionLine
                key={s.id}
                session={s}
                project={projectById.get(s.projectId)}
                zone={zone}
                now={now}
                before={
                  <input
                    type="checkbox"
                    aria-label="Include"
                    checked={!excluded.has(s.id)}
                    onChange={(e) => toggle(s.id, e.target.checked)}
                  />
                }
              />
            ))}
          </ul>
        )}
        <div className={styles.summary}>
          <span>
            {chosen.length} of {candidates.length} sessions
            {rounding.minutes > 0 &&
              ` · rounded ${rounding.mode} to ${rounding.minutes} min (actual ${formatClock(summary.ms)})`}
          </span>
          <strong>
            {formatClock(summary.billedMs)} · {amountLabel(summary.amount)}
          </strong>
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field
              label="Reference"
              hint="Invoice number, tool, or anything that helps you find it."
            >
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="INV-042"
              />
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

        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={formStyles.actions}>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || chosen.length === 0}>
            Create batch
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
