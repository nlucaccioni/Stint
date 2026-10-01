// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import {
  resolveRange,
  toLocalParts,
  weekRange,
  type RangeSelection,
  type Session,
} from '@stint/core'
import { ClientsView, SessionDialog, SessionLog, TimerBar, TotalsView, useNow } from '@stint/ui'
import type { AppInfo } from '../../shared/api'
import { api } from './api'
import { useCatalog } from './useCatalog'
import { useSessions } from './useSessions'
import { useTimer } from './useTimer'
import styles from './App.module.css'

// Until synced preferences exist (default currency, week start), use these defaults.
const DEFAULT_CURRENCY = 'USD'
const WEEK_STARTS_ON = 1 // Monday

// The computer's time zone; days and weeks start at local midnight.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

type Tab = 'projects' | 'time' | 'totals'
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'projects', label: 'Projects' },
  { tab: 'time', label: 'Time' },
  { tab: 'totals', label: 'Totals' },
]
type Editing = { session?: Session } | null

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [tab, setTab] = useState<Tab>('projects')
  const catalog = useCatalog()
  const timer = useTimer()

  // The week shown in the log, identified by its start (null = this week). `now`
  // refreshes each minute so "this week" rolls over at the start of a new week.
  const now = useNow(true, 60_000)
  const thisWeek = weekRange(now, zone, WEEK_STARTS_ON)
  const [weekStart, setWeekStart] = useState<number | null>(null)
  const week = weekRange(weekStart ?? thisWeek.start, zone, WEEK_STARTS_ON)
  const sessions = useSessions(week)
  const [editing, setEditing] = useState<Editing>(null)

  const [totalsSelection, setTotalsSelection] = useState<RangeSelection>({
    kind: 'preset',
    preset: 'thisWeek',
  })
  const totalsRange = resolveRange(totalsSelection, now, zone, WEEK_STARTS_ON)
  const totalsSessions = useSessions(totalsRange)

  useEffect(() => {
    void api.getAppInfo().then(setInfo)
  }, [])

  const runningProject = catalog.projects.find((p) => p.id === timer.running?.projectId) ?? null
  const runningClient = catalog.clients.find((c) => c.id === runningProject?.clientId) ?? null

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Stint</span>
        <nav className={styles.tabs} aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              className={styles.tab}
              aria-current={tab === t.tab ? 'page' : undefined}
              onClick={() => setTab(t.tab)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {info && <span className={styles.muted}>v{info.version}</span>}
      </header>
      <main className={styles.main}>
        {catalog.loadError && (
          <p role="alert" className={styles.error}>
            Couldn't load data: {catalog.loadError}
          </p>
        )}
        {catalog.loaded && (
          <>
            <TimerBar
              running={timer.running}
              project={runningProject}
              client={runningClient}
              onStop={timer.stop}
              onStopAt={timer.stopAt}
            />
            {tab === 'projects' && (
              <ClientsView
                clients={catalog.clients}
                projects={catalog.projects}
                projectIdsWithTime={catalog.projectIdsWithTime}
                defaultCurrency={DEFAULT_CURRENCY}
                runningProjectId={timer.running?.projectId ?? null}
                onToggleTimer={timer.toggle}
                onCreateClient={catalog.createClient}
                onUpdateClient={catalog.updateClient}
                onCreateProject={catalog.createProject}
                onUpdateProject={catalog.updateProject}
                onDeleteClient={catalog.deleteClient}
                onDeleteProject={catalog.deleteProject}
              />
            )}
            {tab === 'time' && (
              <SessionLog
                week={week}
                isCurrentWeek={week.start === thisWeek.start}
                sessions={sessions}
                projects={catalog.projects}
                clients={catalog.clients}
                zone={zone}
                onPrevWeek={() =>
                  setWeekStart(weekRange(week.start - 1, zone, WEEK_STARTS_ON).start)
                }
                onNextWeek={() => setWeekStart(week.end)}
                onThisWeek={() => setWeekStart(null)}
                onAdd={() => setEditing({})}
                onEdit={(session) => setEditing({ session })}
              />
            )}
            {tab === 'totals' && (
              <TotalsView
                selection={totalsSelection}
                onSelectionChange={setTotalsSelection}
                range={totalsRange}
                sessions={totalsSessions}
                projects={catalog.projects}
                clients={catalog.clients}
                zone={zone}
              />
            )}
          </>
        )}
      </main>
      {editing && (
        <SessionDialog
          session={editing.session}
          projects={catalog.projects}
          clients={catalog.clients}
          zone={zone}
          defaultDate={toLocalParts(now, zone).date}
          checkOverlaps={api.findOverlaps}
          onCreate={api.createSession}
          onUpdate={api.updateSession}
          onSplit={api.splitSession}
          onDelete={api.deleteSession}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
