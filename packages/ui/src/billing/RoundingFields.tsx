// SPDX-License-Identifier: GPL-3.0-or-later
// How billed time is rounded: to how many minutes, which way, and what gets
// rounded. Settings uses it for the default; Create Batch for one batch.
import { ROUNDING_STEPS, type Rounding, type RoundingMode, type RoundingScope } from '@stint/core'
import { Field } from '../components/Field'
import { Select } from '../components/Select'
import formStyles from '../catalog/Form.module.css'
import styles from './BillingView.module.css'

const SCOPE_HINTS: Record<RoundingScope, string> = {
  project: 'Adds up each project’s time in a batch, then rounds once.',
  day: 'Adds up each project’s time for each day, then rounds each day.',
  session: 'Rounds every session on its own. Short sessions add up quickly.',
}

export interface RoundingFieldsProps {
  value: Rounding
  /** One field changed. */
  onChange: (edit: Partial<Rounding>) => void
  /** Under "Round Billed Time". */
  minutesHint?: string
  errors?: Partial<Record<keyof Rounding, string>>
}

export function RoundingFields({ value, onChange, minutesHint, errors }: RoundingFieldsProps) {
  const off = value.minutes === 0
  return (
    <>
      <div className={formStyles.row}>
        <div className={formStyles.grow}>
          <Field label="Round Billed Time" hint={minutesHint} error={errors?.minutes}>
            <Select
              value={value.minutes}
              options={ROUNDING_STEPS.map((m) => ({
                value: m,
                label: m === 0 ? 'Off' : `To ${m} Minute${m === 1 ? '' : 's'}`,
              }))}
              onChange={(minutes) => onChange({ minutes })}
            />
          </Field>
        </div>
        <Field label="Direction" error={errors?.mode}>
          <Select
            className={styles.direction}
            value={value.mode}
            disabled={off}
            options={[
              { value: 'up', label: 'Up' },
              { value: 'nearest', label: 'Nearest' },
            ]}
            onChange={(mode) => onChange({ mode: mode as RoundingMode })}
          />
        </Field>
      </div>
      <Field label="Round" hint={SCOPE_HINTS[value.scope]} error={errors?.scope}>
        <Select
          value={value.scope}
          disabled={off}
          options={[
            { value: 'project', label: 'Each Project’s Total' },
            { value: 'day', label: 'Each Project’s Time per Day' },
            { value: 'session', label: 'Each Session' },
          ]}
          onChange={(scope) => onChange({ scope: scope as RoundingScope })}
        />
      </Field>
    </>
  )
}
