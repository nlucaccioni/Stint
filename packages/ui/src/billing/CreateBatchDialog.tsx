// SPDX-License-Identifier: GPL-3.0-or-later
// Bill a client, or some of its projects: pick a date range, untick anything to
// leave out, add a reference.
import { useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
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
import { Field } from '../components/Field'
import { useDragTick } from '../components/useDragTick'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import { useNow } from '../timer/useNow'
import { amountLabel, roundingLabel } from './format'
import { ProjectPicker, type ProjectChoice } from './ProjectPicker'
import { RoundingFields } from './RoundingFields'
import { SessionLine, SessionTick } from './SessionLine'
import styles from './BillingView.module.css'

export interface NewBatchValues {
  clientId: string
  rangeStart: number
  rangeEnd: number
  sessionIds: string[]
  reference: string
  billedAt: number
  note: string
  /** How this batch rounds: the default from Settings, or changed for it. */
  rounding: Rounding
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
  /** The default rounding (Settings). Can be changed for this batch. */
  rounding: Rounding
  zone: string
  onCreate: (values: NewBatchValues) => Promise<unknown>
  onClose: () => void
}

const ALL = { start: 0, end: Infinity }

export function CreateBatchDialog(props: CreateBatchDialogProps) {
  const { clients, projects, unbilledSessions, zone } = props
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
  const [rounding, setRounding] = useState<Rounding>(props.rounding)
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
    setExcluded((prev) => {
      const next = new Set(prev)
      if (include) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const drag = useDragTick((id) => !excluded.has(id), toggle)

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
        rounding,
      })
      props.onClose()
    })
  }

  return (
    <Dialog title="Create Batch" onClose={props.onClose} wide>
      <form className={`${formStyles.form} ${styles.fill}`} onSubmit={submit}>
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

        {/* Sized by the window, empty or full, so the dialog doesn't move (and the
            open dropdown with it) as projects are ticked and unticked. */}
        {candidates.length === 0 ? (
          <div className={`${styles.sessions} ${styles.steady} ${styles.noSessions}`}>
            <p className={formStyles.note}>
              {projectIds.size === 0
                ? 'Choose at least one project.'
                : `No unbilled time for ${client.name} in this range.`}
            </p>
          </div>
        ) : (
          <ul className={`${styles.sessions} ${styles.steady}`} aria-label="Sessions to Bill">
            {candidates.map((s) => (
              <SessionLine
                key={s.id}
                session={s}
                project={projectById.get(s.projectId)}
                zone={zone}
                now={now}
                onPointerEnter={() => drag.enter(s.id)}
                before={
                  <SessionTick
                    label="Include"
                    checked={!excluded.has(s.id)}
                    onToggle={(on) => toggle(s.id, on)}
                    onPointerDown={(e) => drag.start(s.id, e)}
                    onClick={drag.onClick}
                  />
                }
              />
            ))}
          </ul>
        )}
        {/* Two lines that never wrap, so it reads cleanly and keeps its height:
            what's billed and its total, then how it's rounded. */}
        <div className={styles.summary}>
          <span className={styles.summaryText}>
            {chosen.length} of {candidates.length} sessions
            {rounding.minutes > 0 && (
              <span className={styles.muted}> · actual {formatClock(summary.ms)}</span>
            )}
          </span>
          <strong className={styles.summaryTotal}>
            {formatClock(summary.billedMs)} · {amountLabel(summary.amount)}
          </strong>
          <div className={styles.summaryRounding}>
            <RoundingButton value={rounding} default={props.rounding} onChange={setRounding} />
          </div>
        </div>

        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field label="Reference" hint="Invoice number, tool, etc.">
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

/**
 * The summary's "rounded up to 15 min per project": a button that opens the
 * rounding fields, to change how this batch rounds. A dot shows when it's not
 * the default.
 */
function RoundingButton(props: {
  value: Rounding
  default: Rounding
  onChange: (value: Rounding) => void
}) {
  const { value } = props
  const panelId = useId()
  const anchor = `--rounding-${panelId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const changed =
    value.minutes !== props.default.minutes ||
    value.mode !== props.default.mode ||
    value.scope !== props.default.scope
  return (
    <>
      <button
        type="button"
        className={styles.roundingButton}
        popoverTarget={panelId}
        aria-haspopup="dialog"
        style={{ anchorName: anchor } as CSSProperties}
      >
        {value.minutes > 0 ? roundingLabel(value) : 'not rounded'}
        {changed && <span className={styles.changedDot} title="Changed for this batch" />}
        <ChevronDown aria-hidden />
      </button>
      <div
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Rounding for This Batch"
        className={styles.roundingPanel}
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        <RoundingFields value={value} onChange={(edit) => props.onChange({ ...value, ...edit })} />
        <div className={styles.roundingActions}>
          <Button size="sm" disabled={!changed} onClick={() => props.onChange(props.default)}>
            Use Default
          </Button>
          <Button size="sm" popoverTarget={panelId} popoverTargetAction="hide">
            Done
          </Button>
        </div>
      </div>
    </>
  )
}
