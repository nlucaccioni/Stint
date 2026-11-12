// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  ROUNDING_STEPS,
  type Client,
  type Preferences,
  type Project,
  type RoundingMode,
  type RoundingScope,
  type WeekStartDay,
} from '@stint/core'
import { Card } from '../components/Card'
import { Field } from '../components/Field'
import { SavedNote, useSavedFlash } from '../components/SavedNote'
import { Select } from '../components/Select'
import formStyles from '../catalog/Form.module.css'
import styles from './SettingsView.module.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY']

export interface SettingsViewProps {
  preferences: Preferences
  projects: readonly Project[]
  clients: readonly Client[]
  onSave: (edits: Partial<Preferences>) => Promise<unknown>
}

const ROUNDING_SCOPE_HINTS: Record<RoundingScope, string> = {
  project: 'Adds up each project’s time in a batch, then rounds once.',
  day: 'Adds up each project’s time for each day, then rounds each day.',
  session: 'Rounds every session on its own. Short sessions add up quickly.',
}

/** The card each setting is in, where its "Saved" shows. */
const SECTION: Record<keyof Preferences, string> = {
  idleMinutes: 'timer',
  nudgeHours: 'timer',
  weekStartsOn: 'calendar',
  defaultCurrency: 'calendar',
  billingRoundingMinutes: 'billing',
  billingRoundingMode: 'billing',
  billingRoundingScope: 'billing',
  favorites: 'favorites',
}

export function SettingsView({ preferences, projects, clients, onSave }: SettingsViewProps) {
  const [idle, setIdle] = useState(String(preferences.idleMinutes))
  const [nudge, setNudge] = useState(String(preferences.nudgeHours))
  const [weekStart, setWeekStart] = useState<WeekStartDay>(preferences.weekStartsOn)
  const [currency, setCurrency] = useState(preferences.defaultCurrency)
  const [favorites, setFavorites] = useState(preferences.favorites)
  const [roundingMinutes, setRoundingMinutes] = useState(preferences.billingRoundingMinutes)
  const [roundingMode, setRoundingMode] = useState<RoundingMode>(preferences.billingRoundingMode)
  const [roundingScope, setRoundingScope] = useState<RoundingScope>(
    preferences.billingRoundingScope,
  )
  const [errors, setErrors] = useState<Partial<Record<keyof Preferences, string>>>({})
  const saved = useSavedFlash()

  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]
  const weekdays = weekdayNames()

  // Each setting saves as soon as it changes (number fields when you leave them or
  // press Enter), so there's no Save button to scroll down to or forget. "Saved"
  // shows beside the title of the card it's in, where you're looking.
  function save<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setErrors((errs) => ({ ...errs, [key]: undefined }))
    onSave({ [key]: value }).then(
      () => saved.show(SECTION[key]),
      (e: unknown) =>
        setErrors((errs) => ({ ...errs, [key]: e instanceof Error ? e.message : String(e) })),
    )
  }

  /** A number field, saved when you leave it or press Enter, if it changed. */
  function numberProps(
    key: 'idleMinutes' | 'nudgeHours',
    text: string,
    setText: (text: string) => void,
  ) {
    const commit = () => {
      if (text.trim() === '') {
        setErrors((errs) => ({ ...errs, [key]: 'Enter a number. 0 turns it off.' }))
      } else if (Number(text) !== preferences[key] || errors[key]) {
        save(key, Number(text))
      }
    }
    return {
      type: 'number',
      step: 1,
      value: text,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setText(e.target.value),
      onBlur: commit,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit()
      },
    }
  }

  return (
    <section className={styles.view}>
      <h1 className={styles.heading}>Settings</h1>
      <div className={styles.form}>
        <Card title="Timer" status={<SavedNote shown={saved.shownIn('timer')} />}>
          <Field
            label="Ask About Idle Time After (Minutes)"
            hint="When you come back after this long away, Stint asks whether to keep the time. 0 turns it off."
            error={errors.idleMinutes}
          >
            <input {...numberProps('idleMinutes', idle, setIdle)} />
          </Field>
          <Field
            label="Remind Me When a Timer Has Run For (Hours)"
            hint="A notification in case you forgot to stop it. 0 turns it off."
            error={errors.nudgeHours}
          >
            <input {...numberProps('nudgeHours', nudge, setNudge)} />
          </Field>
        </Card>
        <Card title="Calendar and Money" status={<SavedNote shown={saved.shownIn('calendar')} />}>
          <div className={formStyles.row}>
            <div className={formStyles.grow}>
              <Field label="Week Starts On" error={errors.weekStartsOn}>
                <Select
                  value={weekStart}
                  options={weekdays.map((name, day) => ({ value: day, label: name }))}
                  onChange={(day) => {
                    setWeekStart(day as WeekStartDay)
                    save('weekStartsOn', day as WeekStartDay)
                  }}
                />
              </Field>
            </div>
            <div className={formStyles.grow}>
              <Field label="Default Currency for New Clients" error={errors.defaultCurrency}>
                <Select
                  value={currency}
                  options={currencies.map((c) => ({ value: c, label: c }))}
                  onChange={(c) => {
                    setCurrency(c)
                    save('defaultCurrency', c)
                  }}
                />
              </Field>
            </div>
          </div>
        </Card>
        <Card title="Billing" status={<SavedNote shown={saved.shownIn('billing')} />}>
          <div className={formStyles.row}>
            <div className={formStyles.grow}>
              <Field
                label="Round Billed Time"
                hint="Applies when you bill. The log and totals always show actual time."
                error={errors.billingRoundingMinutes}
              >
                <Select
                  value={roundingMinutes}
                  options={ROUNDING_STEPS.map((m) => ({
                    value: m,
                    label: m === 0 ? 'Off' : `To ${m} Minute${m === 1 ? '' : 's'}`,
                  }))}
                  onChange={(m) => {
                    setRoundingMinutes(m)
                    save('billingRoundingMinutes', m)
                  }}
                />
              </Field>
            </div>
            <Field label="Direction" error={errors.billingRoundingMode}>
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
                  save('billingRoundingMode', mode as RoundingMode)
                }}
              />
            </Field>
          </div>
          <Field
            label="Round"
            hint={ROUNDING_SCOPE_HINTS[roundingScope]}
            error={errors.billingRoundingScope}
          >
            <Select
              value={roundingScope}
              disabled={roundingMinutes === 0}
              options={[
                { value: 'project', label: 'Each Project’s Total' },
                { value: 'day', label: 'Each Project’s Time per Day' },
                { value: 'session', label: 'Each Session' },
              ]}
              onChange={(scope) => {
                setRoundingScope(scope as RoundingScope)
                save('billingRoundingScope', scope as RoundingScope)
              }}
            />
          </Field>
        </Card>

        <Card title="Favorites" status={<SavedNote shown={saved.shownIn('favorites')} />}>
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
              save('favorites', next)
            }}
          />
          {errors.favorites && (
            <p className={formStyles.error} role="alert">
              {errors.favorites}
            </p>
          )}
        </Card>
      </div>
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
