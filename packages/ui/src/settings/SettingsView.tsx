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
import { Card } from '../components/Card'
import { Field } from '../components/Field'
import { Select } from '../components/Select'
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
      <form className={styles.form} onSubmit={submit} onChange={() => setSaved(false)}>
        <Card title="Timer">
          <Field
            label="Ask About Idle Time After (Minutes)"
            hint="When you come back after this long away, Stint asks whether to keep the time. 0 turns it off."
          >
            <input type="number" step={1} value={idle} onChange={(e) => setIdle(e.target.value)} />
          </Field>
          <Field
            label="Remind Me When a Timer Has Run For (Hours)"
            hint="A notification in case you forgot to stop it. 0 turns it off."
          >
            <input
              type="number"
              step={1}
              value={nudge}
              onChange={(e) => setNudge(e.target.value)}
            />
          </Field>
        </Card>
        <Card title="Calendar and Money">
          <div className={formStyles.row}>
            <div className={formStyles.grow}>
              <Field label="Week Starts On">
                <Select
                  value={weekStart}
                  options={weekdays.map((name, day) => ({ value: day, label: name }))}
                  onChange={(day) => {
                    setWeekStart(day as WeekStartDay)
                    setSaved(false)
                  }}
                />
              </Field>
            </div>
            <div className={formStyles.grow}>
              <Field label="Default Currency for New Clients">
                <Select
                  value={currency}
                  options={currencies.map((c) => ({ value: c, label: c }))}
                  onChange={(c) => {
                    setCurrency(c)
                    setSaved(false)
                  }}
                />
              </Field>
            </div>
          </div>
        </Card>
        <Card title="Billing">
          <div className={formStyles.row}>
            <div className={formStyles.grow}>
              <Field
                label="Round Billed Time"
                hint="Applies to each session when you bill it. The log and totals always show actual time."
              >
                <Select
                  value={roundingMinutes}
                  options={ROUNDING_STEPS.map((m) => ({
                    value: m,
                    label: m === 0 ? 'Off' : `To ${m} Minute${m === 1 ? '' : 's'}`,
                  }))}
                  onChange={(m) => {
                    setRoundingMinutes(m)
                    setSaved(false)
                  }}
                />
              </Field>
            </div>
            <Field label="Direction">
              <Select
                className={styles.direction}
                value={roundingMode}
                disabled={roundingMinutes === 0}
                options={[
                  { value: 'up', label: 'Up' },
                  { value: 'nearest', label: 'Nearest' },
                ]}
                onChange={(mode) => {
                  setRoundingMode(mode as RoundingMode)
                  setSaved(false)
                }}
              />
            </Field>
          </div>
        </Card>

        <Card title="Favorites">
          <p className={styles.intro}>
            Favorites 1–9 can be started from the tray menu and keyboard shortcuts (and later the MX
            Keypad).
          </p>
          <FavoritePickers
            favorites={favorites}
            projects={projects}
            clients={clients}
            onChange={(next) => {
              setFavorites(next)
              setSaved(false)
            }}
          />
        </Card>
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
            Save Settings
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
        <div key={slot} className={styles.favorite}>
          <span className={styles.slot}>{slot + 1}</span>
          <Select
            className={styles.favoriteSelect}
            aria-label={`Favorite ${slot + 1}`}
            value={projectId ?? ''}
            options={[
              { value: '', label: '—' },
              ...clients.flatMap((client) =>
                projects
                  .filter((p) => p.clientId === client.id && (!p.archived || p.id === projectId))
                  .map((p) => ({ value: p.id, label: p.name, group: client.name })),
              ),
            ]}
            onChange={(id) => pick(slot, id || null)}
          />
        </div>
      ))}
    </div>
  )
}

/** Sunday..Saturday in the user's language. Jan 4 2026 was a Sunday. */
function weekdayNames(): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2026, 0, 4 + i)))
}
