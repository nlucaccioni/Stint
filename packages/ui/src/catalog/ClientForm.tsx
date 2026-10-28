// SPDX-License-Identifier: GPL-3.0-or-later
// New/Edit Client modal (Figma: New Client Modal). Deleting lives in the card's ⋯ menu.
import { useState, type FormEvent } from 'react'
import {
  atFullBrightness,
  parseMoney,
  toMoneyInput,
  type Client,
  type ClientInput,
} from '@stint/core'
import { Button } from '../components/Button'
import { ColorPicker } from '../components/ColorPicker'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
import { Select } from '../components/Select'
import styles from './Form.module.css'
import { useSubmit } from './useSubmit'

const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'JPY',
]

export interface ClientFormProps {
  /** Omit to create a new client. */
  client?: Client
  defaultColor: string
  defaultCurrency: string
  onSubmit: (values: ClientInput) => Promise<void>
  onClose: () => void
  /** The app's own screen color picker, if it has one (see ColorPicker). */
  pickScreenColor?: () => Promise<string | null>
}

export function ClientForm({
  client,
  defaultColor,
  defaultCurrency,
  onSubmit,
  onClose,
  pickScreenColor,
}: ClientFormProps) {
  const [name, setName] = useState(client?.name ?? '')
  // Brightened on open, so a color saved before colors were kept bright is fixed on save.
  const [color, setColor] = useState(() => atFullBrightness(client?.color ?? defaultColor))
  const [currency, setCurrency] = useState(client?.currency ?? defaultCurrency)
  const [rate, setRate] = useState(
    client?.hourlyRateCents != null ? toMoneyInput(client.hourlyRateCents, client.currency) : '',
  )
  const { saving, error, run } = useSubmit()

  const currencies = COMMON_CURRENCIES.includes(currency)
    ? COMMON_CURRENCIES
    : [currency, ...COMMON_CURRENCIES]

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await onSubmit({ name, color, currency, hourlyRateCents: parseMoney(rate, currency) })
      onClose()
    })
  }

  return (
    <Dialog title={client ? 'Edit Client' : 'New Client'} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.row}>
          <div className={styles.grow}>
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client Name"
                autoFocus
                required
              />
            </Field>
          </div>
          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} pickScreenColor={pickScreenColor} />
          </Field>
        </div>
        <div className={styles.row}>
          <div className={styles.grow}>
            <Field label="Hourly Rate">
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="Leave empty if you don't bill this client by the hour."
              />
            </Field>
          </div>
          <Field label="Currency">
            <Select
              value={currency}
              options={currencies.map((c) => ({ value: c, label: c }))}
              onChange={setCurrency}
            />
          </Field>
        </div>
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
            {client ? 'Save' : 'Add Client'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
