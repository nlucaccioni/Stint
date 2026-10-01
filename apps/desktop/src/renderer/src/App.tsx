// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import {
  resolveRange,
  toLocalParts,
  weekRange,
  type RangeSelection,
  type Session,
} from '@stint/core'
import {
  BillingView,
  ClientsView,
  IdleDialog,
  SessionDialog,
  SessionLog,
  SettingsView,
  TimerBar,
  TotalsView,
  useNow,
} from '@stint/ui'
import type { AppInfo, AppView } from '../../shared/api'
import { api, onEvent } from './api'
import { ShortcutSettings } from './ShortcutSettings'
import { SystemSettings } from './SystemSettings'
import { useBilling } from './useBilling'
import { useCatalog } from './useCatalog'
import { useIdle } from './useIdle'
import { usePreferences } from './usePreferences'
import { useSessions } from './useSessions'
import { useTimer } from './useTimer'
import styles from './App.module.css'

// The computer's time zone; days and weeks start at local midnight.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

type Tab = AppView
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'projects', label: 'Projects' },
  { tab: 'time', label: 'Time' },
  { tab: 'totals', label: 'Totals' },
  { tab: 'billing', label: 'Billing' },
  { tab: 'settings', label: 'Settings' },
]
type Editing = { session?: Session } | null

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [tab, setTab] = useState<Tab>('projects')
  const catalog = useCatalog()
  const timer = useTimer()
  const prefs = usePreferences()
  const idle = useIdle()
  const billing = useBilling()
  const weekStartsOn = prefs.preferences.weekStartsOn

  // The week shown in the log, identified by its start (null = this week). `now`
  // refreshes each minute so "this week" rolls over at the start of a new week.
  const now = useNow(true, 60_000)
  const thisWeek = weekRange(now, zone, weekStartsOn)
  const [weekStart, setWeekStart] = useState<number | null>(null)
  const week = weekRange(weekStart ?? thisWeek.start, zone, weekStartsOn)
  const sessions = useSessions(week)
  const [editing, setEditing] = useState<Editing>(null)

  const [totalsSelection, setTotalsSelection] = useState<RangeSelection>({
    kind: 'preset',
    preset: 'thisWeek',
  })
  const totalsRange = resolveRange(totalsSelection, now, zone, weekStartsOn)
  const totalsSessions = useSessions(totalsRange)

  useEffect(() => {
    void api.getAppInfo().then(setInfo)
    // The tray menu can ask for a particular tab (e.g. "Settings…").
    return onEvent('navigate', setTab)
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
        {catalog.loaded && prefs.loaded && (
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
                defaultCurrency={prefs.preferences.defaultCurrency}
                runningProjectId={timer.running?.projectId ?? null}
                favorites={prefs.preferences.favorites}
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
                batches={billing.batches}
                zone={zone}
                onPrevWeek={() => setWeekStart(weekRange(week.start - 1, zone, weekStartsOn).start)}
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
                onExport={() =>
                  api.exportCsv({ start: totalsRange.start, end: totalsRange.end }, zone)
                }
                onShowExport={() => void api.showExportedFile()}
              />
            )}
            {tab === 'billing' && (
              <BillingView
                clients={catalog.clients}
                projects={catalog.projects}
                batches={billing.batches}
                unbilledSessions={billing.unbilledSessions}
                billedSessions={billing.billedSessions}
                rounding={{
                  minutes: prefs.preferences.billingRoundingMinutes,
                  mode: prefs.preferences.billingRoundingMode,
                }}
                zone={zone}
                onCreateBatch={api.createBatch}
                onUpdateBatch={api.updateBatch}
                onAddToBatch={api.addToBatch}
                onUnlockSession={api.unlockSession}
                onUnbillBatch={api.unbillBatch}
              />
            )}
            {tab === 'settings' && info && (
              <>
                <SettingsView
                  preferences={prefs.preferences}
                  projects={catalog.projects}
                  clients={catalog.clients}
                  onSave={prefs.update}
                />
                <ShortcutSettings platform={info.platform} />
                <SystemSettings />
              </>
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
          onUnlock={api.unlockSession}
          batch={billing.batches.find((b) => b.id === editing.session?.billingBatchId) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
      {idle.away && (
        <IdleDialog
          idleStartedAt={idle.away.idleStartedAt}
          returnedAt={idle.away.returnedAt}
          projectName={runningProject?.name ?? 'your project'}
          zone={zone}
          onChoose={idle.resolve}
        />
      )}
    </div>
  )
}
