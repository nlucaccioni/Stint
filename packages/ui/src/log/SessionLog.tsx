// SPDX-License-Identifier: GPL-3.0-or-later
// The Time tab (SPEC.md §6 "Time tab"): recorded time for a range, filtered by
// client/project and billing state, grouped by day (newest first). Click a row to
// edit it, or tick several to change them together.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import {
  billingStatus,
  filterSessions,
  formatClock,
  groupByDay,
  isLocked,
  sessionDuration,
  toLocalParts,
  type BillingBatch,
  type Client,
  type Period,
  type Project,
  type Session,
  type SessionFilter,
  type TimeRange,
  type TimeSelection,
} from '@stint/core'
import { ChevronLeft, ChevronRight, Lock, Plus } from 'lucide-react'
import { Button } from '../components/Button'
import { DateInput } from '../components/DateInput'
import { CheckInput, Checkbox } from '../components/Field'
import { SessionFilterSelects } from '../components/SessionFilterSelects'
import { useNow } from '../timer/useNow'
import { BulkDelete, BulkMove } from './BulkDialogs'
import styles from './SessionLog.module.css'

const PERIOD_CHIPS: { period: Period; offset: number; label: string }[] = [
  { period: 'day', offset: 0, label: 'Today' },
  { period: 'week', offset: 0, label: 'This Week' },
  { period: 'week', offset: -1, label: 'Last Week' },
  { period: 'month', offset: 0, label: 'This Month' },
  { period: 'month', offset: -1, label: 'Last Month' },
]

const PERIOD_NAMES: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month' }

export interface SessionLogProps {
  selection: TimeSelection
  onSelectionChange: (selection: TimeSelection) => void
  /** The selection resolved to times; `sessions` are the ones overlapping it. */
  range: TimeRange
  filter: SessionFilter
  onFilterChange: (filter: SessionFilter) => void
  sessions: readonly Session[]
  projects: readonly Project[]
  clients: readonly Client[]
  /** For showing which sessions are billed or paid. */
  batches: readonly BillingBatch[]
  zone: string
  onAdd: () => void
  onEdit: (session: Session) => void
  /** Edit the ticked sessions together (all or nothing). */
  onUpdateMany: (ids: string[], edits: { billable?: boolean; projectId?: string }) => Promise<void>
  onDeleteMany: (ids: string[]) => Promise<void>
}

export function SessionLog(props: SessionLogProps) {
  const { selection, filter, zone } = props
  const projects = useMemo(() => new Map(props.projects.map((p) => [p.id, p])), [props.projects])
  const clients = useMemo(() => new Map(props.clients.map((c) => [c.id, c])), [props.clients])
  const batches = useMemo(() => new Map(props.batches.map((b) => [b.id, b])), [props.batches])

  const shown = useMemo(
    () => filterSessions(props.sessions, filter, props.projects, batches),
    [props.sessions, filter, props.projects, batches],
  )
  const now = useNow(shown.some((s) => s.endedAt === null))
  const days = useMemo(() => groupByDay(shown, zone, now), [shown, zone, now])
  const total = days.reduce((sum, d) => sum + d.ms, 0)

  // Ticked sessions. Only the ones still shown (and not billed) count, so changing
  // the range or filters never acts on something out of view.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const selectable = shown.filter((s) => !isLocked(s))
  const selected = selectable.filter((s) => ticked.has(s.id))
  const allTicked = selectable.length > 0 && selected.length === selectable.length
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag to tick: press on a row's box and move over other rows to give them the
  // same state (ticked or not) as the first one got. Ends wherever the pointer
  // is let go.
  const dragTo = useRef<boolean | null>(null)
  useEffect(() => {
    const end = () => {
      dragTo.current = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  function startDrag(id: string, e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault() // no text selection while dragging
    const on = !ticked.has(id)
    dragTo.current = on
    tick(id, on)
  }

  function tick(id: string, on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setTicked(new Set())
      setDialog(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const ids = () => selected.map((s) => s.id)

  const today = toLocalParts(now, zone).date
  const period = selection.kind === 'period' ? selection : null

  return (
    <section className={styles.log}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Time</h1>
        <span className={styles.range}>
          {selection.kind === 'all' ? 'All Time' : rangeLabel(props.range, zone)}
        </span>
        <span className={styles.spacer} />
        <span className={styles.total}>
          <span className={styles.count}>
            {shown.length} {shown.length === 1 ? 'Session' : 'Sessions'}
          </span>
          {formatClock(total)}
        </span>
        <Button variant="primary" onClick={props.onAdd}>
          <Plus size={16} /> Add Time
        </Button>
      </header>

      <div className={styles.rangePicker}>
        <div className={styles.chips}>
          <div className={styles.filters} role="group" aria-label="Date Range">
            {PERIOD_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className={styles.chip}
                aria-pressed={period?.period === chip.period && period.offset === chip.offset}
                onClick={() => props.onSelectionChange({ kind: 'period', ...chip })}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              className={styles.chip}
              aria-pressed={selection.kind === 'all'}
              onClick={() => props.onSelectionChange({ kind: 'all' })}
            >
              All Time
            </button>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={selection.kind === 'custom'}
              onClick={() =>
                // Starts from the range being shown (today, for All Time).
                props.onSelectionChange({
                  kind: 'custom',
                  from: selection.kind === 'all' ? today : toLocalParts(props.range.start, zone).date,
                  to:
                    selection.kind === 'all'
                      ? today
                      : toLocalParts(Math.min(props.range.end - 1, now), zone).date,
                })
              }
            >
              Custom
            </button>
          </div>
          {period && (
            <div className={styles.stepper}>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Previous ${PERIOD_NAMES[period.period]}`}
                onClick={() => props.onSelectionChange({ ...period, offset: period.offset - 1 })}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Next ${PERIOD_NAMES[period.period]}`}
                disabled={period.offset >= 0}
                onClick={() => props.onSelectionChange({ ...period, offset: period.offset + 1 })}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
        {selection.kind === 'custom' && (
          <div className={styles.custom}>
            <DateInput
              aria-label="From"
              value={selection.from}
              onChange={(from) => props.onSelectionChange({ ...selection, from })}
            />
            <span aria-hidden>–</span>
            <DateInput
              aria-label="To"
              value={selection.to}
              onChange={(to) => props.onSelectionChange({ ...selection, to })}
            />
          </div>
        )}
      </div>

      <div className={styles.toolbar}>
        <Checkbox
          label="Select All"
          checked={allTicked}
          ref={(el) => {
            if (el) el.indeterminate = selected.length > 0 && !allTicked
          }}
          disabled={selectable.length === 0}
          onChange={() => setTicked(allTicked ? new Set() : new Set(selectable.map((s) => s.id)))}
        />
        {selected.length === 0 ? (
          <div className={styles.filterSelects}>
            <SessionFilterSelects
              filter={filter}
              onChange={props.onFilterChange}
              clients={props.clients}
              projects={props.projects}
            />
          </div>
        ) : (
          <div className={styles.bulk} role="group" aria-label="Selected Sessions">
            <span className={styles.selectedCount}>{selected.length} Selected</span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void act(() => props.onUpdateMany(ids(), { billable: true }))}
            >
              Make Billable
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void act(() => props.onUpdateMany(ids(), { billable: false }))}
            >
              Make Non-Billable
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setDialog('move')}>
              Move to Project…
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setDialog('delete')}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {error && !dialog && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {days.length === 0 && (
        <p className={styles.empty}>
          {props.sessions.length === 0
            ? 'No time recorded in this range.'
            : 'No time matches these filters.'}
        </p>
      )}

      {days.map(({ day, sessions: daySessions, ms }) => (
        <div key={day.start} className={styles.day}>
          <div className={styles.dayHeader}>
            <span>{dayLabel(day.start, zone, now)}</span>
            <span className={styles.dayTotal}>{formatClock(ms)}</span>
          </div>
          <ul className={styles.rows}>
            {daySessions.map((s) => {
              const project = projects.get(s.projectId)
              const client = project && clients.get(project.clientId)
              const locked = isLocked(s)
              return (
                <li
                  key={s.id}
                  className={styles.item}
                  data-running={s.endedAt === null || undefined}
                  data-ticked={ticked.has(s.id) || undefined}
                  onPointerEnter={() => {
                    if (dragTo.current !== null && !locked) tick(s.id, dragTo.current)
                  }}
                >
                  <span
                    className={styles.tick}
                    data-locked={locked || undefined}
                    onPointerDown={locked ? undefined : (e) => startDrag(s.id, e)}
                  >
                    {locked ? (
                      <Lock size={12} aria-label="Billed sessions can't be selected" />
                    ) : (
                      <CheckInput
                        aria-label={`Select ${project?.name ?? 'session'}`}
                        checked={ticked.has(s.id)}
                        // A pointer press already ticked it (see startDrag); the
                        // click that follows would undo that. Keyboard (Space)
                        // clicks have no detail and still toggle here.
                        onClick={(e) => {
                          if (e.detail > 0) e.preventDefault()
                        }}
                        onChange={(e) => tick(s.id, e.target.checked)}
                      />
                    )}
                  </span>
                  <button type="button" className={styles.row} onClick={() => props.onEdit(s)}>
                    <span
                      className={styles.swatch}
                      style={{ '--client-color': client?.color } as CSSProperties}
                      aria-hidden
                    />
                    <span className={styles.what}>
                      <span className={styles.project}>
                        {project?.name ?? 'Unknown project'}
                        {client && <span className={styles.client}> · {client.name}</span>}
                      </span>
                      {s.note && <span className={styles.note}>{s.note}</span>}
                    </span>
                    {!s.billable && <span className={styles.tag}>Non-Billable</span>}
                    {locked && (
                      <span className={styles.tag} title="Billed sessions are locked">
                        <Lock size={8} aria-hidden />{' '}
                        {billingStatus(s, batches) === 'paid' ? 'Paid' : 'Billed'}
                      </span>
                    )}
                    <span className={styles.times}>
                      {toLocalParts(s.startedAt, zone).time}–
                      {s.endedAt === null ? 'now' : toLocalParts(s.endedAt, zone).time}
                    </span>
                    <span className={styles.duration}>{formatClock(sessionDuration(s, now))}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {dialog === 'move' && (
        <BulkMove
          count={selected.length}
          projects={props.projects}
          clients={props.clients}
          busy={busy}
          error={error}
          onMove={(projectId) => void act(() => props.onUpdateMany(ids(), { projectId }))}
          onClose={() => {
            setDialog(null)
            setError(null)
          }}
        />
      )}
      {dialog === 'delete' && (
        <BulkDelete
          count={selected.length}
          ms={selected.reduce((n, s) => n + sessionDuration(s, now), 0)}
          busy={busy}
          error={error}
          onDelete={() => void act(() => props.onDeleteMany(ids()))}
          onClose={() => {
            setDialog(null)
            setError(null)
          }}
        />
      )}
    </section>
  )
}

/** "Nov 3, 2026 – Nov 9, 2026", or one date for a single day. */
function rangeLabel(range: TimeRange, zone: string): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: zone,
  })
  const first = fmt.format(range.start)
  const last = fmt.format(range.end - 1)
  return first === last ? first : `${first} – ${last}`
}

function dayLabel(dayStart: number, zone: string, now: number): string {
  const day = toLocalParts(dayStart, zone).date
  if (day === toLocalParts(now, zone).date) return 'Today'
  if (day === toLocalParts(now - 86_400_000, zone).date) return 'Yesterday'
  const sameYear = day.slice(0, 4) === toLocalParts(now, zone).date.slice(0, 4)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone: zone,
  }).format(dayStart)
}
