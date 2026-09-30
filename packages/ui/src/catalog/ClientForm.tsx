// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type FormEvent } from 'react'
import { parseMoney, toMoneyInput, type Client, type ClientInput } from '@stint/core'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
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
}

export function ClientForm({
  client,
  defaultColor,
  defaultCurrency,
  onSubmit,
  onClose,
}: ClientFormProps) {
  const [name, setName] = useState(client?.name ?? '')
  const [color, setColor] = useState(client?.color ?? defaultColor)
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
    <Dialog title={client ? 'Edit client' : 'New client'} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.row}>
          <div className={styles.grow}>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </Field>
          </div>
          <Field label="Color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </Field>
        </div>
        <div className={styles.row}>
          <div className={styles.grow}>
            <Field
              label="Hourly rate"
              hint="Leave empty if you don't bill this client by the hour."
            >
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
          </div>
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {client ? 'Save' : 'Add client'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
