// SPDX-License-Identifier: GPL-3.0-or-later
// "Are you sure?" for deleting a client or project from its ⋯ menu. Recorded time
// is deleted with it; billed time blocks the delete, and Archive is offered.
import { useState } from 'react'
import { formatClock } from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import styles from './Form.module.css'

export interface DeleteTarget {
  kind: 'client' | 'project'
  name: string
  /** For a client: how many projects go with it. */
  projectCount: number
  recordedMs: number
  sessionCount: number
  hasBilledTime: boolean
  onDelete: () => Promise<unknown>
  onArchive: () => Promise<unknown>
}

export function ConfirmDelete({ target, onClose }: { target: DeleteTarget; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { kind, name } = target

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (target.hasBilledTime) {
    return (
      <Dialog title={`Can't delete "${name}"`} onClose={onClose}>
        <div className={styles.form}>
          <p className={styles.note}>
            This {kind} has billed time, which belongs to an invoice, so it can't be deleted.
            Archive it instead to hide it.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => run(target.onArchive)}>
              Archive
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  const projects =
    kind === 'client' && target.projectCount > 0
      ? ` and its ${target.projectCount} project${target.projectCount === 1 ? '' : 's'}`
      : ''
  const sessions = target.sessionCount
  return (
    <Dialog title={`Delete "${name}"${projects}?`} onClose={onClose}>
      <div className={styles.form}>
        <p className={styles.note}>
          {sessions === 0
            ? "This can't be undone."
            : `${formatClock(target.recordedMs)} of recorded time (${sessions} session${
                sessions === 1 ? '' : 's'
              }) will be deleted too. This can't be undone.`}
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={() => run(target.onDelete)}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
