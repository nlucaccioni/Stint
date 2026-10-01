// SPDX-License-Identifier: GPL-3.0-or-later
// Add a manual entry, or edit a recorded session: project, date, times, note,
// billable. Also split and delete. Warns (but allows) overlapping time.
import { useEffect, useState, type FormEvent } from 'react'
import {
  formatClock,
  fromLocalParts,
  localSpan,
  toLocalParts,
  type BillingBatch,
  type Client,
  type Project,
  type Session,
  type SessionEdits,
} from '@stint/core'
import { Lock } from 'lucide-react'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Checkbox, Field } from '../components/Field'
import { DeleteAction } from '../catalog/DeleteAction'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import styles from './SessionDialog.module.css'

export interface NewSessionValues {
  projectId: string
  startedAt: number
  endedAt: number
  note: string
  billable: boolean
}

export interface OverlapCheck {
  id?: string
  startedAt: number
  endedAt: number | null
}

export interface SessionDialogProps {
  /** Omit to add a manual entry. */
  session?: Session
  projects: readonly Project[]
  clients: readonly Client[]
  zone: string
  /** Default date for a new entry ("2026-03-10"). */
  defaultDate: string
  checkOverlaps: (query: OverlapCheck) => Promise<Session[]>
  onCreate: (values: NewSessionValues) => Promise<unknown>
  onUpdate: (id: string, edits: SessionEdits) => Promise<unknown>
  onSplit: (id: string, at: number) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  /** Take a billed session out of its batch so it can be edited. */
  onUnlock: (id: string) => Promise<unknown>
  /** The batch a billed session belongs to (for the read-only view). */
  batch?: BillingBatch | null
  onClose: () => void
}

export function SessionDialog(props: SessionDialogProps) {
  // Billed sessions are read-only until deliberately unlocked (SPEC.md §6 "Locking").
  if (props.session?.billingBatchId) {
    return <LockedSession {...props} session={props.session} />
  }
  return <EditableSession {...props} />
}

function LockedSession(props: SessionDialogProps & { session: Session }) {
  const { session: s, zone, batch } = props
  const project = props.projects.find((p) => p.id === s.projectId)
  const client = props.clients.find((c) => c.id === project?.clientId)
  const [error, setError] = useState<string | null>(null)
  const start = toLocalParts(s.startedAt, zone)
  const end = s.endedAt === null ? 'now' : toLocalParts(s.endedAt, zone).time
  const status = batch?.paidAt != null ? 'paid' : 'billed'
  return (
    <Dialog title="Billed time" onClose={props.onClose}>
      <div className={formStyles.form}>
        <p className={styles.locked}>
          <Lock size={14} aria-hidden /> This time is {status}
          {batch?.reference ? ` (${batch.reference})` : ''}, so it can’t be changed. Unlock it to
          edit: it’s removed from the batch and becomes unbilled.
        </p>
        <dl className={styles.details}>
          <dt>Project</dt>
          <dd>
            {project?.name ?? 'Unknown project'}
            {client && ` · ${client.name}`}
          </dd>
          <dt>When</dt>
          <dd>
            {start.date}, {start.time}–{end} (
            {formatClock((s.endedAt ?? s.startedAt) - s.startedAt)})
          </dd>
          {s.note && (
            <>
              <dt>Note</dt>
              <dd>{s.note}</dd>
            </>
          )}
        </dl>
        <DeleteAction
          kind="session"
          onError={setError}
          label="Unlock to edit…"
          confirmLabel="Unlock"
          warning=""
          deletion={{
            allowed: true,
            question: 'Remove this session from its batch?',
            onDelete: async () => {
              await props.onUnlock(s.id)
              props.onClose()
            },
          }}
        />
        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={formStyles.actions}>
          <Button onClick={props.onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  )
}

function EditableSession(props: SessionDialogProps) {
  const { session, projects, clients, zone } = props
  const running = session?.endedAt === null
  const start = session ? toLocalParts(session.startedAt, zone) : null
  const end = session?.endedAt != null ? toLocalParts(session.endedAt, zone) : null

  const startable = projects.filter((p) => !p.archived || p.id === session?.projectId)
  const [projectId, setProjectId] = useState(session?.projectId ?? startable[0]?.id ?? '')
  const [date, setDate] = useState(start?.date ?? props.defaultDate)
  const [startTime, setStartTime] = useState(start?.time ?? '09:00')
  const [endTime, setEndTime] = useState(end?.time ?? '10:00')
  const [note, setNote] = useState(session?.note ?? '')
  const [billable, setBillable] = useState(
    session?.billable ?? projects.find((p) => p.id === projectId)?.billableByDefault ?? true,
  )
  const [overlaps, setOverlaps] = useState<Session[]>([])
  const [splitting, setSplitting] = useState(false)
  const { saving, error, setError, run } = useSubmit()

  // The span as typed. A running session has no end yet.
  const span = running
    ? { startedAt: fromLocalParts(date, startTime, zone), endedAt: null }
    : localSpan(date, startTime, endTime, zone)
  const valid = !Number.isNaN(span.startedAt) && !Number.isNaN(span.endedAt ?? 0)
  const overnight =
    !running &&
    valid &&
    toLocalParts(span.endedAt!, zone).date !== toLocalParts(span.startedAt, zone).date

  // Look for overlaps shortly after the times stop changing.
  const { checkOverlaps } = props
  const sessionId = session?.id
  useEffect(() => {
    if (!valid) return
    let active = true
    const timer = setTimeout(() => {
      checkOverlaps({ id: sessionId, startedAt: span.startedAt, endedAt: span.endedAt })
        .then((found) => active && setOverlaps(found))
        .catch(() => active && setOverlaps([]))
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [checkOverlaps, sessionId, span.startedAt, span.endedAt, valid])

  /** Editing the times makes any earlier error out of date. */
  function onTime(set: (v: string) => void) {
    return (e: { target: { value: string } }) => {
      set(e.target.value)
      setError(null)
    }
  }

  function pickProject(id: string) {
    setProjectId(id)
    // New entries follow the project's billable default.
    if (!session) setBillable(projects.find((p) => p.id === id)?.billableByDefault ?? true)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      if (!valid) throw new Error('Enter a valid date and times.')
      if (session) {
        await props.onUpdate(session.id, {
          projectId,
          startedAt: span.startedAt,
          ...(running ? {} : { endedAt: span.endedAt! }),
          note,
          billable,
        })
      } else {
        await props.onCreate({
          projectId,
          startedAt: span.startedAt,
          endedAt: span.endedAt!,
          note,
          billable,
        })
      }
      props.onClose()
    })
  }

  const projectLabel = (id: string) => {
    const p = projects.find((x) => x.id === id)
    const c = clients.find((x) => x.id === p?.clientId)
    return p ? `${p.name} (${c?.name ?? '?'})` : 'Unknown project'
  }

  return (
    <Dialog title={session ? 'Edit time' : 'Add time'} onClose={props.onClose}>
      <form className={formStyles.form} onSubmit={submit}>
        <Field label="Project">
          <select value={projectId} onChange={(e) => pickProject(e.target.value)} required>
            {clients.map((client) => {
              const own = startable.filter((p) => p.clientId === client.id)
              if (own.length === 0) return null
              return (
                <optgroup key={client.id} label={client.name}>
                  {own.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </Field>

        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field label="Date">
              <input type="date" value={date} onChange={onTime(setDate)} required />
            </Field>
          </div>
          <Field label="Start">
            <input type="time" value={startTime} onChange={onTime(setStartTime)} required />
          </Field>
          <Field label="End">
            {running ? (
              <input value="Running" disabled />
            ) : (
              <input type="time" value={endTime} onChange={onTime(setEndTime)} required />
            )}
          </Field>
        </div>
        {valid && !running && (
          <p className={formStyles.note}>
            {formatClock(span.endedAt! - span.startedAt)}
            {overnight && ' · ends the next day'}
          </p>
        )}

        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <Checkbox
          label="Billable"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
        />

        {overlaps.length > 0 && (
          <div className={styles.warning} role="status">
            Overlaps with{' '}
            {overlaps
              .map((s) => {
                const a = toLocalParts(s.startedAt, zone)
                const b = s.endedAt === null ? 'now' : toLocalParts(s.endedAt, zone).time
                return `${projectLabel(s.projectId)} ${a.time}–${b}`
              })
              .join(', ')}
            . You can still save.
          </div>
        )}

        {session && splitting && (
          <SplitRow
            session={session}
            zone={zone}
            onCancel={() => setSplitting(false)}
            onSplit={(at) =>
              run(async () => {
                await props.onSplit(session.id, at)
                props.onClose()
              })
            }
          />
        )}

        {session && !splitting && (
          <div className={styles.secondary}>
            <Button size="sm" onClick={() => setSplitting(true)}>
              Split…
            </Button>
            <DeleteAction
              kind="session"
              onError={setError}
              deletion={{
                allowed: true,
                question: 'Delete this time entry?',
                onDelete: async () => {
                  await props.onDelete(session.id)
                  props.onClose()
                },
              }}
            />
          </div>
        )}

        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={formStyles.actions}>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !projectId}>
            {session ? 'Save' : 'Add time'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function SplitRow(props: {
  session: Session
  zone: string
  onSplit: (at: number) => void
  onCancel: () => void
}) {
  const { session, zone } = props
  // Default to the middle of the session (or of start..now if running).
  const [value, setValue] = useState(() => {
    const end = session.endedAt ?? Date.now()
    const mid = toLocalParts(session.startedAt + (end - session.startedAt) / 2, zone)
    return `${mid.date}T${mid.time}`
  })
  const [date, time] = value.split('T')
  return (
    <div className={styles.split}>
      <Field label="Split at" hint="The first part keeps this entry; the rest becomes a new one.">
        <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div className={styles.splitActions}>
        <Button size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => props.onSplit(fromLocalParts(date ?? '', time ?? '', zone))}
        >
          Split
        </Button>
      </div>
    </div>
  )
}
