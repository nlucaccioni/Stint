// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/api'
import styles from './App.module.css'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.stint.getAppInfo().then(setInfo)
  }, [])

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Stint</h1>
      <p className={styles.muted}>{info ? `v${info.version} · ${info.platform}` : 'Loading…'}</p>
    </main>
  )
}
