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
  // The session "Stop at…" was opened for; if that timer stops some other way
  // (tray, shortcut), the dialog no longer applies and stays closed.
  const [stoppingAtId, setStoppingAtId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function stopNow() {
    setError(null)
    onStop().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  // The clock and buttons are always shown (disabled while idle) so nothing moves
  // when a timer starts or stops.
  return (
    <div
      className={styles.bar}
      data-running={running ? '' : undefined}
      data-idle={running ? undefined : ''}
    >
      {running ? (
        <>
          <span
            className={styles.swatch}
            style={{ background: project && client ? projectColor(project, client) : undefined }}
            aria-hidden
          />
          <span className={styles.what}>
            <span className={styles.project}>{project?.name ?? 'Unknown project'}</span>
            {client && <span className={styles.client}>{client.name}</span>}
          </span>
        </>
      ) : (
        <span className={styles.muted}>No timer running</span>
      )}
      <span className={styles.clock} role="timer" aria-live="off">
        {running ? formatClock(now - running.startedAt) : '0:00:00'}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className={styles.iconButton}
        aria-label="Stop at an earlier time…"
        title="Stop at an earlier time…"
        disabled={!running}
        onClick={() => setStoppingAtId(running?.id ?? null)}
      >
        <Clock size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        className={`${styles.iconButton} ${styles.stop}`}
        aria-label="Stop"
        title="Stop"
        disabled={!running}
        onClick={stopNow}
      >
        <Square size={12} fill="currentColor" aria-hidden />
      </Button>
      {running && stoppingAtId === running.id && (
        <StopAtDialog
          startedAt={running.startedAt}
          onSubmit={onStopAt}
          onClose={() => setStoppingAtId(null)}
        />
      )}
    </div>
  )
}
