// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type FormEvent } from 'react'
import type { Preferences, WeekStartDay } from '@stint/core'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import styles from './SettingsView.module.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY']

export interface SettingsViewProps {
  preferences: Preferences
  onSave: (edits: Partial<Preferences>) => Promise<unknown>
}

export function SettingsView({ preferences, onSave }: SettingsViewProps) {
  const [idle, setIdle] = useState(String(preferences.idleMinutes))
  const [nudge, setNudge] = useState(String(preferences.nudgeHours))
  const [weekStart, setWeekStart] = useState<WeekStartDay>(preferences.weekStartsOn)
  const [currency, setCurrency] = useState(preferences.defaultCurrency)
  const [saved, setSaved] = useState(false)
  const { saving, error, run } = useSubmit()

  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]
  const weekdays = weekdayNames()

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    void run(async () => {
      await onSave({
        idleMinutes: Number(idle),
        nudgeHours: Number(nudge),
        weekStartsOn: weekStart,
        defaultCurrency: currency,
      })
      setSaved(true)
    })
  }

  return (
    <section className={styles.view}>
      <h1 className={styles.heading}>Settings</h1>
      <form className={formStyles.form} onSubmit={submit} onChange={() => setSaved(false)}>
        <Field
          label="Ask about idle time after (minutes)"
          hint="When you come back after this long away, Stint asks whether to keep the time. 0 turns it off."
        >
          <input type="number" step={1} value={idle} onChange={(e) => setIdle(e.target.value)} />
        </Field>
        <Field
          label="Remind me when a timer has run for (hours)"
          hint="A notification in case you forgot to stop it. 0 turns it off."
        >
          <input type="number" step={1} value={nudge} onChange={(e) => setNudge(e.target.value)} />
        </Field>
        <Field label="Week starts on">
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(Number(e.target.value) as WeekStartDay)}
          >
            {weekdays.map((name, day) => (
              <option key={day} value={day}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default currency for new clients">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={formStyles.actions}>
          {saved && (
            <span className={styles.saved} role="status">
              Saved
            </span>
          )}
          <Button type="submit" variant="primary" disabled={saving}>
            Save settings
          </Button>
        </div>
      </form>
    </section>
  )
}

/** Sunday..Saturday in the user's language. Jan 4 2026 was a Sunday. */
function weekdayNames(): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2026, 0, 4 + i)))
}
