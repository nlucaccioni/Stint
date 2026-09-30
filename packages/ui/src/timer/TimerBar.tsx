// SPDX-License-Identifier: GPL-3.0-or-later
// The running timer, shown at the top of the main window.
import { useState } from 'react'
import { formatClock, projectColor, type Client, type Project, type Session } from '@stint/core'
import { Button } from '../components/Button'
import { StopIcon } from '../components/icons'
import { StopAtDialog } from './StopAtDialog'
import { useNow } from './useNow'
import styles from './TimerBar.module.css'

export interface TimerBarProps {
  running: Session | null
  /** The running session's project and client (null while idle). */
  project: Project | null
  client: Client | null
  onStop: () => Promise<unknown>
  onStopAt: (at: number) => Promise<unknown>
}

export function TimerBar({ running, project, client, onStop, onStopAt }: TimerBarProps) {
  const now = useNow(running !== null)
  const [stoppingAt, setStoppingAt] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!running) {
    return (
      <div className={styles.bar} data-idle>
        <span className={styles.clock}>0:00:00</span>
        <span className={styles.muted}>No timer running. Press ▶ next to a project to start.</span>
      </div>
    )
  }

  function stopNow() {
    setError(null)
    onStop().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className={styles.bar} data-running>
      <span
        className={styles.swatch}
        style={{ background: project && client ? projectColor(project, client) : undefined }}
        aria-hidden
      />
      <span className={styles.clock} role="timer" aria-live="off">
        {formatClock(now - running.startedAt)}
      </span>
      <span className={styles.what}>
        <span className={styles.project}>{project?.name ?? 'Unknown project'}</span>
        {client && <span className={styles.muted}>{client.name}</span>}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <Button variant="ghost" onClick={() => setStoppingAt(true)}>
        Stop at…
      </Button>
      <Button variant="primary" onClick={stopNow}>
        <StopIcon /> Stop
      </Button>
      {stoppingAt && (
        <StopAtDialog
          startedAt={running.startedAt}
          onSubmit={onStopAt}
          onClose={() => setStoppingAt(false)}
        />
      )}
    </div>
  )
}
