// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import { ClientsView } from '@stint/ui'
import type { AppInfo } from '../../shared/api'
import { api } from './api'
import { useCatalog } from './useCatalog'
import styles from './App.module.css'

// Until synced preferences exist (default currency setting), new clients default to USD.
const DEFAULT_CURRENCY = 'USD'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const catalog = useCatalog()

  useEffect(() => {
    void api.getAppInfo().then(setInfo)
  }, [])

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
          <ClientsView
            clients={catalog.clients}
            projects={catalog.projects}
            projectIdsWithTime={catalog.projectIdsWithTime}
            defaultCurrency={DEFAULT_CURRENCY}
            onCreateClient={catalog.createClient}
            onUpdateClient={catalog.updateClient}
            onCreateProject={catalog.createProject}
            onUpdateProject={catalog.updateProject}
            onDeleteClient={catalog.deleteClient}
            onDeleteProject={catalog.deleteProject}
          />
        )}
      </main>
    </div>
  )
}
