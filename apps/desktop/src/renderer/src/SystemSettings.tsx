// SPDX-License-Identifier: GPL-3.0-or-later
// Settings that belong to this computer rather than syncing (desktop only).
import { useEffect, useState } from 'react'
import { Checkbox } from '@stint/ui'
import type { LaunchAtLogin } from '../../shared/api'
import { api } from './api'
import styles from './ShortcutSettings.module.css'

export function SystemSettings() {
  const [login, setLogin] = useState<LaunchAtLogin | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.getLaunchAtLogin().then((l) => active && setLogin(l))
    return () => {
      active = false
    }
  }, [])

  if (!login) return null

  function toggle(enabled: boolean) {
    setError(null)
    api
      .setLaunchAtLogin(enabled)
      .then(setLogin)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>This computer</h2>
      <Checkbox
        label="Open Stint when I log in (it starts in the tray / menu bar)"
        checked={login.enabled}
        disabled={!login.available}
        onChange={(e) => toggle(e.target.checked)}
      />
      {!login.available && (
        <p className={styles.intro}>Available in the installed app, not in development builds.</p>
      )}
      {error && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
