// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react'
import { Button } from '../components/Button'
import styles from './Form.module.css'

export interface Deletion {
  /** False when the item has recorded time. */
  allowed: boolean
  /** Shown when confirming, e.g. 'Delete "Acme" and its 2 projects?' */
  question: string
  onDelete: () => Promise<void>
}

/** Delete button for edit dialogs, with an inline "are you sure?" step. */
export function DeleteAction({
  deletion,
  kind,
  onError,
}: {
  deletion: Deletion
  kind: 'client' | 'project' | 'session'
  onError: (message: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!deletion.allowed) {
    return (
      <p className={styles.note}>
        This {kind} has recorded time, so it can't be deleted. Archive it instead.
      </p>
    )
  }

  if (!confirming) {
    return (
      <div>
        <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
          Delete {kind}…
        </Button>
      </div>
    )
  }

  async function confirm() {
    setBusy(true)
    try {
      await deletion.onDelete()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.confirm} role="alert">
      <span>{deletion.question} This can't be undone.</span>
      <Button size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => void confirm()}>
        Delete
      </Button>
    </div>
  )
}
