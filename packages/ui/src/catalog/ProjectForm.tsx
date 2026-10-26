// SPDX-License-Identifier: GPL-3.0-or-later
// New/Edit Project modal (Figma: New Project, with its budget variants). Deleting
// lives in the project's ⋯ menu.
import { useState, type FormEvent } from 'react'
import {
  formatMoney,
  parseHours,
  parseMoney,
  projectBudget,
  toHoursInput,
  toMoneyInput,
  weekStartDayToIso,
  type Budget,
  type BudgetPeriod,
  type Client,
  type Project,
  type ProjectEdits,
  type WeekStartDay,
} from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { CheckBox, Field } from '../components/Field'
import { Select } from '../components/Select'
import styles from './Form.module.css'
import { useSubmit } from './useSubmit'

export type ProjectValues = Required<Omit<ProjectEdits, 'archived'>>

type BudgetUnit = Budget['unit'] | 'none'

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'total', label: 'Never' },
  { value: 'week', label: 'Every Week' },
  { value: 'month', label: 'Every Month' },
]

/** ISO weekdays, 1 = Monday. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
  (label, i) => ({ value: i + 1, label }),
)

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1).padStart(2, '0'),
}))

export interface ProjectFormProps {
  client: Client
  /** Omit to create a new project. */
  project?: Project
  /** Default reset weekday for a new weekly budget. */
  weekStartsOn: WeekStartDay
  onSubmit: (values: ProjectValues) => Promise<void>
  onClose: () => void
}

export function ProjectForm({
  client,
  project,
  weekStartsOn,
  onSubmit,
  onClose,
}: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? '')
  const [rate, setRate] = useState(
    project?.hourlyRateCents != null ? toMoneyInput(project.hourlyRateCents, client.currency) : '',
  )
  const [billable, setBillable] = useState(project?.billableByDefault ?? true)

  const initial = project ? projectBudget(project) : null
  const [unit, setUnit] = useState<BudgetUnit>(initial?.unit ?? 'none')
  const [amount, setAmount] = useState(
    !initial
      ? ''
      : initial.unit === 'minutes'
        ? toHoursInput(initial.amount)
        : toMoneyInput(initial.amount, client.currency),
  )
  const [period, setPeriod] = useState<BudgetPeriod>(initial?.period ?? 'total')
  // Weekly and monthly reset days are kept apart so switching back and forth keeps each.
  const [weekDay, setWeekDay] = useState(
    initial?.period === 'week' ? initial.resetDay : weekStartDayToIso(weekStartsOn),
  )
  const [monthDay, setMonthDay] = useState(initial?.period === 'month' ? initial.resetDay : 1)
  const { saving, error, run } = useSubmit()

  const clientRate =
    client.hourlyRateCents === null
      ? 'Leave empty for no rate (the client has none).'
      : `Leave empty to use client rate. (${formatMoney(client.hourlyRateCents, client.currency)}/hr)`

  function budget(): Budget | null {
    if (unit === 'none') return null
    const parsed = unit === 'minutes' ? parseHours(amount) : parseMoney(amount, client.currency)
    if (parsed === null) throw new Error('Enter a budget amount, or choose No Budget.')
    const resetDay = period === 'week' ? weekDay : period === 'month' ? monthDay : 1
    return { unit, amount: parsed, period, resetDay }
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
    <Dialog title={project ? 'Edit Project' : `New Project for ${client.name}`} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project Name"
            autoFocus
            required
          />
        </Field>
        <div className={styles.row}>
          <div className={styles.grow}>
            <Field label={`Hourly Rate (${client.currency})`}>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder={clientRate}
              />
            </Field>
          </div>
          <Field label="Billable">
            <CheckBox checked={billable} onChange={setBillable} />
          </Field>
        </div>

        <hr className={styles.divider} />

        <div className={styles.row}>
          <Field label="Budget">
            <Select
              className={styles.budgetUnit}
              value={unit}
              options={[
                { value: 'none', label: 'No Budget' },
                { value: 'minutes', label: 'Hours' },
                { value: 'cents', label: 'Amount' },
              ]}
              onChange={setUnit}
            />
          </Field>
          {unit !== 'none' && (
            <div className={styles.grow}>
              <Field label={unit === 'minutes' ? 'Hours' : `Amount (${client.currency})`}>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </Field>
            </div>
          )}
        </div>
        {unit !== 'none' && (
          <div className={styles.row}>
            <div className={styles.grow}>
              <Field label="Resets">
                <Select value={period} options={PERIODS} onChange={setPeriod} />
              </Field>
            </div>
            {period === 'week' && (
              <Field label="On Day">
                <Select
                  className={styles.resetDay}
                  mono
                  value={weekDay}
                  options={WEEKDAYS}
                  onChange={setWeekDay}
                />
              </Field>
            )}
            {period === 'month' && (
              <Field label="On Day">
                <Select
                  className={styles.resetDay}
                  mono
                  value={monthDay}
                  options={MONTH_DAYS}
                  onChange={setMonthDay}
                />
              </Field>
            )}
          </div>
        )}
        {/* Spans both columns, under Resets and On Day, as in the design. */}
        {unit !== 'none' && (
          <p className={styles.fieldHint}>
            {period === 'total'
              ? 'Fixed cap for the whole project.'
              : 'A rolling cap, for retainers. Counts billable time in the current period.'}
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {project ? 'Save' : 'Add Project'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
