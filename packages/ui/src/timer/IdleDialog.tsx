// SPDX-License-Identifier: GPL-3.0-or-later
// Shown when the user comes back after being away while a timer ran.
import { useState } from 'react'
import { formatClock, toLocalParts, type IdleChoice } from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import formStyles from '../catalog/Form.module.css'
import styles from './IdleDialog.module.css'

export interface IdleDialogProps {
  idleStartedAt: number
  returnedAt: number
  projectName: string
  zone: string
  onChoose: (choice: IdleChoice) => Promise<unknown>
}

export function IdleDialog(props: IdleDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const from = toLocalParts(props.idleStartedAt, props.zone).time
  const to = toLocalParts(props.returnedAt, props.zone).time

  async function choose(choice: IdleChoice) {
    setBusy(true)
    setError(null)
    try {
      await props.onChoose(choice)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    // Closing without choosing (Escape) keeps the time, the option that loses nothing.
    <Dialog title="You were away" onClose={() => void choose('keep')}>
      <p className={styles.body}>
        From {from} to {to} ({formatClock(props.returnedAt - props.idleStartedAt)}), while the timer
        for <strong>{props.projectName}</strong> kept running.
      </p>
      {error && (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.choices}>
        <Button variant="primary" disabled={busy} onClick={() => void choose('keep')}>
          Keep the time
        </Button>
        <Button disabled={busy} onClick={() => void choose('discard-continue')}>
          Discard it, keep timing
        </Button>
        <Button disabled={busy} onClick={() => void choose('discard')}>
          Discard it and stop
        </Button>
      </div>
    </Dialog>
  )
}
