// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type FormEvent } from 'react'
import {
  formatMoney,
  parseMoney,
  toMoneyInput,
  type Client,
  type Project,
  type ProjectEdits,
} from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Checkbox, Field } from '../components/Field'
import styles from './Form.module.css'
import { useSubmit } from './useSubmit'

export type ProjectValues = Required<Omit<ProjectEdits, 'archived'>>

export interface ProjectFormProps {
  client: Client
  /** Omit to create a new project. */
  project?: Project
  onSubmit: (values: ProjectValues) => Promise<void>
  onClose: () => void
}

export function ProjectForm({ client, project, onSubmit, onClose }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? '')
  const [useClientColor, setUseClientColor] = useState(project ? project.color === null : true)
  const [color, setColor] = useState(project?.color ?? client.color)
  const [rate, setRate] = useState(
    project?.hourlyRateCents != null ? toMoneyInput(project.hourlyRateCents, client.currency) : '',
  )
  const [billable, setBillable] = useState(project?.billableByDefault ?? true)
  const { saving, error, run } = useSubmit()

  const clientRate =
    client.hourlyRateCents === null
      ? 'the client has no rate'
      : `uses the client rate, ${formatMoney(client.hourlyRateCents, client.currency)}/h`

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await onSubmit({
        name,
        color: useClientColor ? null : color,
        hourlyRateCents: parseMoney(rate, client.currency),
        billableByDefault: billable,
      })
      onClose()
    })
  }

  return (
    <Dialog title={project ? 'Edit project' : `New project for ${client.name}`} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <div className={styles.row}>
          <Checkbox
            label="Use client color"
            checked={useClientColor}
            onChange={(e) => setUseClientColor(e.target.checked)}
          />
          <input
            type="color"
            aria-label="Project color"
            value={useClientColor ? client.color : color}
            disabled={useClientColor}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <Field label={`Hourly rate (${client.currency})`} hint={`Leave empty: ${clientRate}.`}>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="Client rate"
          />
        </Field>
        <Checkbox
          label="Billable by default"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {project ? 'Save' : 'Add project'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
