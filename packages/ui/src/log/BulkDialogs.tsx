// SPDX-License-Identifier: GPL-3.0-or-later
// The Time tab's dialogs for ticked sessions: Move to Project… and Delete.
import { useState } from 'react'
import { formatClock, type Client, type Project } from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
import { Select, type SelectOption } from '../components/Select'
import styles from '../catalog/Form.module.css'

const sessionCount = (n: number) => `${n} ${n === 1 ? 'Session' : 'Sessions'}`

interface BulkDialogProps {
  count: number
  busy: boolean
  error: string | null
  onClose: () => void
}

export function BulkMove(
  props: BulkDialogProps & {
    projects: readonly Project[]
    clients: readonly Client[]
    onMove: (projectId: string) => void
  },
) {
  // Only projects that can take time: not archived, and not under an archived client.
  const options: SelectOption<string>[] = props.clients
    .filter((c) => !c.archived)
    .flatMap((c) =>
      props.projects
        .filter((p) => p.clientId === c.id && !p.archived)
        .map((p) => ({ value: p.id, label: p.name, group: c.name })),
    )
  const [projectId, setProjectId] = useState(options[0]?.value ?? '')

  return (
    <Dialog title={`Move ${sessionCount(props.count)}`} onClose={props.onClose}>
      <div className={styles.form}>
        <Field label="Project">
          <Select value={projectId} options={options} onChange={setProjectId} />
        </Field>
        {props.error && (
          <p className={styles.error} role="alert">
            {props.error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={props.busy || !projectId}
            onClick={() => props.onMove(projectId)}
          >
            Move
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function BulkDelete(props: BulkDialogProps & { ms: number; onDelete: () => void }) {
  return (
    <Dialog title={`Delete ${sessionCount(props.count)}?`} onClose={props.onClose}>
      <div className={styles.form}>
        <p className={styles.note}>
          {formatClock(props.ms)} of recorded time will be deleted. This can&apos;t be undone.
        </p>
        {props.error && (
          <p className={styles.error} role="alert">
            {props.error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={props.busy} onClick={props.onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
