// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type FormEvent } from 'react'
import {
  ROUNDING_STEPS,
  type Client,
  type Preferences,
  type Project,
  type RoundingMode,
  type WeekStartDay,
} from '@stint/core'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import formStyles from '../catalog/Form.module.css'
import { useSubmit } from '../catalog/useSubmit'
import styles from './SettingsView.module.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY']

export interface SettingsViewProps {
  preferences: Preferences
  projects: readonly Project[]
  clients: readonly Client[]
  onSave: (edits: Partial<Preferences>) => Promise<unknown>
}

export function SettingsView({ preferences, projects, clients, onSave }: SettingsViewProps) {
  const [idle, setIdle] = useState(String(preferences.idleMinutes))
  const [nudge, setNudge] = useState(String(preferences.nudgeHours))
  const [weekStart, setWeekStart] = useState<WeekStartDay>(preferences.weekStartsOn)
  const [currency, setCurrency] = useState(preferences.defaultCurrency)
  const [favorites, setFavorites] = useState(preferences.favorites)
  const [roundingMinutes, setRoundingMinutes] = useState(preferences.billingRoundingMinutes)
  const [roundingMode, setRoundingMode] = useState<RoundingMode>(preferences.billingRoundingMode)
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
        favorites,
        billingRoundingMinutes: roundingMinutes,
        billingRoundingMode: roundingMode,
      })
      setSaved(true)
    })
  }

  return (
    <section className={styles.view}>
      <h1 className={styles.heading}>Settings</h1>
      <form className={formStyles.form} onSubmit={submit} onChange={() => setSaved(false)}>
        <h2 className={styles.section}>Timer</h2>
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
        <h2 className={styles.section}>Calendar and money</h2>
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
        <h2 className={styles.section}>Billing</h2>
        <div className={formStyles.row}>
          <div className={formStyles.grow}>
            <Field
              label="Round billed time"
              hint="Applies to each session when you bill it. The log and totals always show actual time."
            >
              <select
                value={roundingMinutes}
                onChange={(e) => setRoundingMinutes(Number(e.target.value))}
              >
                {ROUNDING_STEPS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'Off' : `To ${m} minute${m === 1 ? '' : 's'}`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Direction">
            <select
              value={roundingMode}
              disabled={roundingMinutes === 0}
              onChange={(e) => setRoundingMode(e.target.value as RoundingMode)}
            >
              <option value="up">Up</option>
              <option value="nearest">Nearest</option>
            </select>
          </Field>
        </div>

        <h2 className={styles.section}>Favorites</h2>
        <p className={styles.intro}>
          Favorites 1–9 can be started from the tray menu and keyboard shortcuts (and later the MX
          Keypad).
        </p>
        <FavoritePickers
          favorites={favorites}
          projects={projects}
          clients={clients}
          onChange={setFavorites}
        />
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

function FavoritePickers(props: {
  favorites: (string | null)[]
  projects: readonly Project[]
  clients: readonly Client[]
  onChange: (favorites: (string | null)[]) => void
}) {
  const { favorites, projects, clients } = props

  function pick(slot: number, projectId: string | null) {
    // A project can only hold one slot, so picking it here moves it from any other.
    const next = favorites.map((id) => (id === projectId ? null : id))
    next[slot] = projectId
    props.onChange(next)
  }

  return (
    <div className={styles.favorites}>
      {favorites.map((projectId, slot) => (
        <label key={slot} className={styles.favorite}>
          <span className={styles.slot}>{slot + 1}</span>
          <select
            aria-label={`Favorite ${slot + 1}`}
            value={projectId ?? ''}
            onChange={(e) => pick(slot, e.target.value || null)}
          >
            <option value="">—</option>
            {clients.map((client) => {
              const own = projects.filter(
                (p) => p.clientId === client.id && (!p.archived || p.id === projectId),
              )
              if (own.length === 0) return null
              return (
                <optgroup key={client.id} label={client.name}>
                  {own.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </label>
      ))}
    </div>
  )
}

/** Sunday..Saturday in the user's language. Jan 4 2026 was a Sunday. */
function weekdayNames(): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2026, 0, 4 + i)))
}
