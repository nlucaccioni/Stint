// SPDX-License-Identifier: GPL-3.0-or-later
// Bill a client, or some of its projects: pick a date range, untick anything to
// leave out, add a reference.
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
import { DateInput } from '../components/DateInput'
import { CheckInput, Field } from '../components/Field'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import { useNow } from '../timer/useNow'
import { amountLabel, roundingLabel } from './format'
import { ProjectPicker, type ProjectChoice } from './ProjectPicker'
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

/** What to bill when the dialog opens: a whole client, or one of its projects. */
export interface BillTarget {
  clientId: string
  projectId?: string
}

export interface CreateBatchDialogProps {
  clients: readonly Client[]
  /** Chosen when the dialog opens; can be changed in it. */
  initial: BillTarget
  projects: readonly Project[]
  unbilledSessions: readonly Session[]
  rounding: Rounding
  zone: string
  onCreate: (values: NewBatchValues) => Promise<unknown>
  onClose: () => void
}

const ALL = { start: 0, end: Infinity }

export function CreateBatchDialog(props: CreateBatchDialogProps) {
  const { clients, projects, unbilledSessions, rounding, zone } = props
  const now = useNow(true, 60_000)
  const today = toLocalParts(now, zone).date
  const [clientId, setClientId] = useState(props.initial.clientId)
  const client = clients.find((c) => c.id === clientId)!

  // The client's projects that have unbilled time, in the user's order.
  const projectsWithTime = (id: string) => {
    const withTime = new Set(
      batchCandidates(unbilledSessions, projects, id, ALL).map((s) => s.projectId),
    )
    return projects.filter((p) => withTime.has(p.id))
  }
  // Which of them to bill: all, or the one the dialog was opened for.
  const [projectIds, setProjectIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        props.initial.projectId
          ? [props.initial.projectId]
          : projectsWithTime(props.initial.clientId).map((p) => p.id),
      ),
  )

  // Clients with unbilled time, each with its projects that have some.
  const pickerOptions = useMemo(
    () =>
      clients
        .map((c) => ({ client: c, projects: projectsWithTime(c.id) }))
        .filter((o) => o.projects.length > 0),
    // projectsWithTime only reads these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients, projects, unbilledSessions],
  )

  // Default range: from the oldest unbilled session of what's chosen, to today.
  const oldest = (id: string, ids: ReadonlySet<string>) => {
    const first = batchCandidates(unbilledSessions, projects, id, ALL).find((s) =>
      ids.has(s.projectId),
    )
    return first ? toLocalParts(first.startedAt, zone).date : today
  }
  const [from, setFrom] = useState(() => oldest(clientId, projectIds))
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
    () =>
      range
        ? batchCandidates(unbilledSessions, projects, clientId, range).filter((s) =>
            projectIds.has(s.projectId),
          )
        : [],
    [unbilledSessions, projects, clientId, projectIds, range],
  )
  const chosen = candidates.filter((s) => !excluded.has(s.id))
  const summary = billingSummary(chosen, projects, client, rounding, now, zone)
  const projectById = new Map(projects.map((p) => [p.id, p]))

  function choose(next: ProjectChoice) {
    if (next.clientId !== clientId) setExcluded(new Set())
    setClientId(next.clientId)
    setProjectIds(next.projectIds)
    if (next.projectIds.size > 0) setFrom(oldest(next.clientId, next.projectIds))
  }

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
    <Dialog title="Create Batch" onClose={props.onClose}>
      <form className={formStyles.form} onSubmit={submit}>
        <Field label="Client or Project">
          <ProjectPicker
            options={pickerOptions}
            value={{ clientId, projectIds }}
            onChange={choose}
          />
        </Field>
        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field label="From">
              <DateInput value={from} onChange={setFrom} />
            </Field>
          </div>
          <div className={formStyles.grow}>
            <Field label="To">
              <DateInput value={to} onChange={setTo} />
            </Field>
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className={formStyles.note}>
            {projectIds.size === 0
              ? 'Choose at least one project.'
              : `No unbilled time for ${client.name} in this range.`}
          </p>
        ) : (
          <ul className={styles.sessions} aria-label="Sessions to Bill">
            {candidates.map((s) => (
              <SessionLine
                key={s.id}
                session={s}
                project={projectById.get(s.projectId)}
                zone={zone}
                now={now}
                before={
                  <CheckInput
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
              ` · ${roundingLabel(rounding)} (actual ${formatClock(summary.ms)})`}
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
          <Field label="Billed On">
            <DateInput value={billedOn} onChange={setBilledOn} />
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
            Create Batch
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
