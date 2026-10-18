// SPDX-License-Identifier: GPL-3.0-or-later
// The running timer, shown on the right of the main window's tab bar.
import { useState, type CSSProperties } from 'react'
import { formatClock, type Client, type Project, type Session } from '@stint/core'
import { IconButton } from '../components/IconButton'
import { Timer } from 'lucide-react'
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
  // when a timer starts or stops. While running, the pill takes the client's color.
  return (
    <div
      className={styles.bar}
      data-running={running ? '' : undefined}
      data-idle={running ? undefined : ''}
      style={running && client ? ({ '--client-color': client.color } as CSSProperties) : undefined}
    >
      {running ? (
        <span className={styles.what}>
          <span className={styles.project}>{project?.name ?? 'Unknown project'}</span>
          {client && <span className={styles.client}>{client.name}</span>}
        </span>
      ) : (
        <span className={styles.muted}>No Timer Active</span>
      )}
      <span className={styles.clock} role="timer" aria-live="off">
        {running ? formatClock(now - running.startedAt) : '0:00:00'}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <IconButton
        label="Stop at an earlier time…"
        disabled={!running}
        onClick={() => setStoppingAtId(running?.id ?? null)}
      >
        <Timer aria-hidden />
      </IconButton>
      <button
        type="button"
        className={styles.stop}
        aria-label="Stop"
        title="Stop"
        disabled={!running}
        onClick={stopNow}
      >
        <span className={styles.stopIcon} aria-hidden />
      </button>
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
