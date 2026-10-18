// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type FormEvent } from 'react'
import {
  formatMoney,
  parseHours,
  parseMoney,
  projectBudget,
  toHoursInput,
  toMoneyInput,
  type Budget,
  type BudgetPeriod,
  type Client,
  type Project,
  type ProjectEdits,
} from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Checkbox, Field } from '../components/Field'
import { DeleteAction, type Deletion } from './DeleteAction'
import styles from './Form.module.css'
import { useSubmit } from './useSubmit'

export type ProjectValues = Required<Omit<ProjectEdits, 'archived'>>

export interface ProjectFormProps {
  client: Client
  /** Omit to create a new project. */
  project?: Project
  onSubmit: (values: ProjectValues) => Promise<void>
  onClose: () => void
  /** Only when editing. */
  deletion?: Deletion
}

export function ProjectForm({ client, project, onSubmit, onClose, deletion }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? '')
  const [rate, setRate] = useState(
    project?.hourlyRateCents != null ? toMoneyInput(project.hourlyRateCents, client.currency) : '',
  )
  const [billable, setBillable] = useState(project?.billableByDefault ?? true)
  const initialBudget = project ? projectBudget(project) : null
  const [budgetUnit, setBudgetUnit] = useState<Budget['unit'] | 'none'>(
    initialBudget?.unit ?? 'none',
  )
  const [budgetAmount, setBudgetAmount] = useState(
    !initialBudget
      ? ''
      : initialBudget.unit === 'minutes'
        ? toHoursInput(initialBudget.amount)
        : toMoneyInput(initialBudget.amount, client.currency),
  )
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>(initialBudget?.period ?? 'total')
  const [resetDay, setResetDay] = useState(initialBudget?.resetDay ?? 1)
  const { saving, error, setError, run } = useSubmit()

  const clientRate =
    client.hourlyRateCents === null
      ? 'the client has no rate'
      : `uses the client rate, ${formatMoney(client.hourlyRateCents, client.currency)}/h`

  function budget(): Budget | null {
    if (budgetUnit === 'none') return null
    const amount =
      budgetUnit === 'minutes'
        ? parseHours(budgetAmount)
        : parseMoney(budgetAmount, client.currency)
    if (amount === null) throw new Error('Enter a budget amount, or choose No budget.')
    return { unit: budgetUnit, amount, period: budgetPeriod, resetDay }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await onSubmit({
        name,
        hourlyRateCents: parseMoney(rate, client.currency),
        billableByDefault: billable,
        budget: budget(),
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
        <div className={styles.row}>
          <Field label="Budget">
            <select
              value={budgetUnit}
              onChange={(e) => setBudgetUnit(e.target.value as Budget['unit'] | 'none')}
            >
              <option value="none">No budget</option>
              <option value="minutes">Hours</option>
              <option value="cents">Amount ({client.currency})</option>
            </select>
          </Field>
          {budgetUnit !== 'none' && (
            <div className={styles.grow}>
              <Field label={budgetUnit === 'minutes' ? 'Hours' : `Amount (${client.currency})`}>
                <input
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={budgetUnit === 'minutes' ? '20' : '5000.00'}
                  required
                />
              </Field>
            </div>
          )}
        </div>
        {budgetUnit !== 'none' && (
          <div className={styles.row}>
            <div className={styles.grow}>
              <Field
                label="Resets"
                hint={
                  budgetPeriod === 'total'
                    ? 'A fixed cap for the whole project.'
                    : 'A rolling cap, for retainers. Counts billable time in the current period.'
                }
              >
                <select
                  value={budgetPeriod}
                  onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriod)}
                >
                  <option value="total">Never</option>
                  <option value="week">Every week</option>
                  <option value="month">Every month</option>
                </select>
              </Field>
            </div>
            {budgetPeriod === 'month' && (
              <Field label="On day">
                <select value={resetDay} onChange={(e) => setResetDay(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
        {deletion && <DeleteAction deletion={deletion} kind="project" onError={setError} />}
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
