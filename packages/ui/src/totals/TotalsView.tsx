// SPDX-License-Identifier: GPL-3.0-or-later
// Totals for a chosen date range: headline figures, a client → project breakdown,
// and time per day. Everything is computed from sessions (core), never stored.
import { useMemo, useState, type ReactNode } from 'react'
import {
  computeTotals,
  dailyTotals,
  formatClock,
  formatMoney,
  projectColor,
  toLocalParts,
  type Client,
  type Money,
  type Project,
  type RangePreset,
  type RangeSelection,
  type Session,
  type TimeRange,
} from '@stint/core'
import { Button } from '../components/Button'
import { useNow } from '../timer/useNow'
import styles from './TotalsView.module.css'

const PRESETS: { preset: RangePreset; label: string }[] = [
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: 'thisWeek', label: 'This week' },
  { preset: 'lastWeek', label: 'Last week' },
  { preset: 'thisMonth', label: 'This month' },
  { preset: 'lastMonth', label: 'Last month' },
]

/** Longest range that gets a per-day list. */
const MAX_DAYS_LISTED = 62

export interface TotalsViewProps {
  selection: RangeSelection
  onSelectionChange: (selection: RangeSelection) => void
  /** The selection resolved to times. */
  range: TimeRange
  sessions: readonly Session[]
  projects: readonly Project[]
  clients: readonly Client[]
  zone: string
  /** Save the sessions in the current range as CSV (asks where to save). */
  onExport: () => Promise<{ saved: boolean; count: number }>
  /** Reveal the last exported file in Finder / Explorer. */
  onShowExport: () => void
}

export function TotalsView(props: TotalsViewProps) {
  const { selection, range, sessions, projects, clients, zone } = props
  const [exportStatus, setExportStatus] = useState<
    { kind: 'done'; count: number } | { kind: 'error'; message: string } | null
  >(null)
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setExporting(true)
    setExportStatus(null)
    try {
      const result = await props.onExport()
      if (result.saved) setExportStatus({ kind: 'done', count: result.count })
    } catch (e) {
      setExportStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setExporting(false)
    }
  }
  // A running timer keeps adding time, shown to the second.
  const now = useNow(sessions.some((s) => s.endedAt === null))

  const totals = useMemo(
    () => computeTotals({ sessions, projects, clients, range, now }),
    [sessions, projects, clients, range, now],
  )
  const days = useMemo(() => {
    const spanDays = (range.end - range.start) / 86_400_000
    return spanDays <= MAX_DAYS_LISTED ? dailyTotals(sessions, range, zone, now) : null
  }, [sessions, range, zone, now])

  const clientById = new Map(clients.map((c) => [c.id, c]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const today = toLocalParts(now, zone).date
  const customFrom = selection.kind === 'custom' ? selection.from : today
  const customTo = selection.kind === 'custom' ? selection.to : today

  return (
    <section className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Totals</h1>
        <span className={styles.range}>{rangeLabel(range, zone)}</span>
        <span className={styles.spacer} />
        {exportStatus?.kind === 'done' && (
          <span className={styles.exported} role="status">
            Exported {exportStatus.count} {exportStatus.count === 1 ? 'session' : 'sessions'}.{' '}
            <Button size="sm" variant="ghost" onClick={props.onShowExport}>
              Show file
            </Button>
          </span>
        )}
        {exportStatus?.kind === 'error' && (
          <span className={styles.exportError} role="alert">
            {exportStatus.message}
          </span>
        )}
        <Button onClick={() => void exportCsv()} disabled={exporting}>
          Export CSV
        </Button>
      </header>

      <div className={styles.filters} role="group" aria-label="Date range">
        {PRESETS.map(({ preset, label }) => (
          <button
            key={preset}
            type="button"
            className={styles.chip}
            aria-pressed={selection.kind === 'preset' && selection.preset === preset}
            onClick={() => props.onSelectionChange({ kind: 'preset', preset })}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={styles.chip}
          aria-pressed={selection.kind === 'custom'}
          onClick={() =>
            props.onSelectionChange({ kind: 'custom', from: customFrom, to: customTo })
          }
        >
          Custom
        </button>
        {selection.kind === 'custom' && (
          <span className={styles.custom}>
            <input
              type="date"
              aria-label="From"
              value={selection.from}
              onChange={(e) =>
                e.target.value && props.onSelectionChange({ ...selection, from: e.target.value })
              }
            />
            <span aria-hidden>–</span>
            <input
              type="date"
              aria-label="To"
              value={selection.to}
              onChange={(e) =>
                e.target.value && props.onSelectionChange({ ...selection, to: e.target.value })
              }
            />
          </span>
        )}
      </div>

      <div className={styles.tiles}>
        <Tile label="Total time" value={formatClock(totals.ms)} />
        <Tile label="Billable time" value={formatClock(totals.billableMs)} />
        <Tile
          label="Billable amount"
          value={
            totals.amounts.length === 0
              ? '—'
              : totals.amounts.map((m) => formatMoney(m.cents, m.currency))
          }
        />
      </div>

      {totals.byClient.length === 0 ? (
        <p className={styles.empty}>No time recorded in this range.</p>
      ) : (
        <table className={styles.table}>
          <caption className={styles.caption}>By client and project</caption>
          <thead>
            <tr>
              <th scope="col">Client / project</th>
              <th scope="col" className={styles.num}>
                Time
              </th>
              <th scope="col" className={styles.num}>
                Billable
              </th>
              <th scope="col" className={styles.num}>
                Amount
              </th>
            </tr>
          </thead>
          {totals.byClient.map((ct) => {
            const client = clientById.get(ct.clientId)
            const own = totals.byProject.filter((pt) => pt.clientId === ct.clientId)
            return (
              <tbody key={ct.clientId}>
                <tr className={styles.clientRow}>
                  <th scope="row">
                    <Name color={client?.color}>{client?.name ?? 'Unknown client'}</Name>
                  </th>
                  <td className={styles.num}>{formatClock(ct.ms)}</td>
                  <td className={styles.num}>{formatClock(ct.billableMs)}</td>
                  <td className={styles.num}>{amountsLabel(ct.amounts)}</td>
                </tr>
                {own.map((pt) => {
                  const project = projectById.get(pt.projectId)
                  return (
                    <tr key={pt.projectId} className={styles.projectRow}>
                      <th scope="row">
                        <Name color={project && client ? projectColor(project, client) : undefined}>
                          {project?.name ?? 'Unknown project'}
                        </Name>
                      </th>
                      <td className={styles.num}>{formatClock(pt.ms)}</td>
                      <td className={styles.num}>{formatClock(pt.billableMs)}</td>
                      <td className={styles.num}>{amountsLabel(pt.amounts)}</td>
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
      )}

      {days && days.length > 1 && totals.ms > 0 && (
        <table className={styles.table}>
          <caption className={styles.caption}>By day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col" className={styles.num}>
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.start} data-empty={d.ms === 0 || undefined}>
                <th scope="row">{dayLabel(d.start, zone)}</th>
                <td className={styles.num}>{formatClock(d.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** A headline figure. Several values (one per currency) stack, one per line. */
function Tile({ label, value }: { label: string; value: string | string[] }) {
  const values = Array.isArray(value) ? value : [value]
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      {values.map((v) => (
        <span key={v} className={styles.tileValue} data-several={values.length > 1 || undefined}>
          {v}
        </span>
      ))}
    </div>
  )
}

function Name({ color, children }: { color: string | undefined; children: ReactNode }) {
  return (
    <span className={styles.name}>
      <span className={styles.swatch} style={{ background: color }} aria-hidden />
      {children}
    </span>
  )
}

/** Amounts are per currency and never added together across currencies. */
function amountsLabel(amounts: readonly Money[]): string {
  if (amounts.length === 0) return '—'
  return amounts.map((m) => formatMoney(m.cents, m.currency)).join(' + ')
}

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

function dayLabel(dayStart: number, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: zone,
  }).format(dayStart)
}
