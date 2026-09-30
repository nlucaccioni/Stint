// SPDX-License-Identifier: GPL-3.0-or-later
// "Stop at…": end the running timer at an earlier time (e.g. you forgot to stop it).
import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
import styles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'

export interface StopAtDialogProps {
  startedAt: number
  onSubmit: (at: number) => Promise<unknown>
  onClose: () => void
}

export function StopAtDialog({ startedAt, onSubmit, onClose }: StopAtDialogProps) {
  const [value, setValue] = useState(() => toLocalInput(Date.now()))
  const { saving, error, run } = useSubmit()

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      // datetime-local values have no zone; the Date constructor reads them as local time.
      // Range checks happen in core, which gives a clearer message than the browser's.
      const at = new Date(value).getTime()
      if (Number.isNaN(at)) throw new Error('Enter a date and time.')
      await onSubmit(at)
      onClose()
    })
  }

  return (
    <Dialog title="Stop timer at…" onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <Field label="Stopped at" hint={`Started ${new Date(startedAt).toLocaleString()}.`}>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            required
          />
        </Field>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            Stop timer
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Epoch ms → "2026-03-10T14:30" in local time, for datetime-local inputs. */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
