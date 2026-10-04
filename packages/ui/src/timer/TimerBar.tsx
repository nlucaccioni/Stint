// SPDX-License-Identifier: GPL-3.0-or-later
// The running timer, shown on the right of the main window's tab bar.
import { useState } from 'react'
import { formatClock, projectColor, type Client, type Project, type Session } from '@stint/core'
import { Button } from '../components/Button'
import { Clock, Square } from 'lucide-react'
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
        <span className={styles.muted}>No timer running</span>
        <span className={styles.clock}>0:00:00</span>
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
      <span className={styles.what}>
        <span className={styles.project}>{project?.name ?? 'Unknown project'}</span>
        {client && <span className={styles.client}>{client.name}</span>}
      </span>
      <span className={styles.clock} role="timer" aria-live="off">
        {formatClock(now - running.startedAt)}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Stop at an earlier time…"
        title="Stop at an earlier time…"
        onClick={() => setStoppingAt(true)}
      >
        <Clock size={14} aria-hidden />
      </Button>
      <Button variant="primary" size="sm" onClick={stopNow}>
        <Square size={12} fill="currentColor" /> Stop
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
