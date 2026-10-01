// SPDX-License-Identifier: GPL-3.0-or-later
// Add a manual entry, or edit a recorded session: project, date, times, note,
// billable. Also split and delete. Warns (but allows) overlapping time.
import { useEffect, useState, type FormEvent } from 'react'
import {
  formatHoursMinutes,
  fromLocalParts,
  localSpan,
  toLocalParts,
  type Client,
  type Project,
  type Session,
  type SessionEdits,
} from '@stint/core'
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
  onClose: () => void
}

export function SessionDialog(props: SessionDialogProps) {
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
            {formatHoursMinutes(span.endedAt! - span.startedAt)}
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
