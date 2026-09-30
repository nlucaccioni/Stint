// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import { ClientsView, TimerBar } from '@stint/ui'
import type { AppInfo } from '../../shared/api'
import { api } from './api'
import { useCatalog } from './useCatalog'
import { useTimer } from './useTimer'
import styles from './App.module.css'

// Until synced preferences exist (default currency setting), new clients default to USD.
const DEFAULT_CURRENCY = 'USD'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const catalog = useCatalog()
  const timer = useTimer()

  useEffect(() => {
    void api.getAppInfo().then(setInfo)
  }, [])

  const runningProject = catalog.projects.find((p) => p.id === timer.running?.projectId) ?? null
  const runningClient = catalog.clients.find((c) => c.id === runningProject?.clientId) ?? null

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Stint</span>
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
          </>
        )}
      </main>
    </div>
  )
}
