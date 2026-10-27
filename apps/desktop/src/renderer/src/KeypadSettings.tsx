// SPDX-License-Identifier: GPL-3.0-or-later
// The Local API that the MX Keypad plugin connects to (device-local, desktop only).
import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Checkbox, Field } from '@stint/ui'
import type { LocalApiStatus } from '../../shared/api'
import { api, onEvent } from './api'
import styles from './ShortcutSettings.module.css'

export function KeypadSettings() {
  const [status, setStatus] = useState<LocalApiStatus | null>(null)
  const [port, setPort] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.getLocalApi().then((s) => {
      if (!active) return
      setStatus(s)
      setPort(String(s.port))
    })
    // Clients connecting or leaving, or the server starting, arrive from main.
    const off = onEvent('localApiChanged', setStatus)
    return () => {
      active = false
      off()
    }
  }, [])

  if (!status) return null

  function run(action: () => Promise<LocalApiStatus>) {
    setError(null)
    action()
      .then((s) => {
        setStatus(s)
        setPort(String(s.port))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  function savePort(e?: FormEvent) {
    e?.preventDefault()
    if (Number(port) !== status?.port) run(() => api.setLocalApi({ port: Number(port) }))
  }

  return (
    <Card title="MX Keypad">
      <Checkbox
        label="Allow the MX Keypad Plugin to Connect"
        checked={status.enabled}
        onChange={(e) => run(() => api.setLocalApi({ enabled: e.target.checked }))}
      />
      {status.enabled && (
        <form onSubmit={savePort}>
          <Field
            label="Port"
            hint="Change this only if another program uses the same port. The plugin finds the new one by itself."
          >
            <input
              type="number"
              step={1}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onBlur={() => savePort()}
            />
          </Field>
        </form>
      )}
      <p className={status.problem ? styles.problem : styles.intro} role="status">
        {describe(status)}
      </p>
      {status.enabled && (
        <div className={styles.buttons}>
          <Button onClick={() => run(() => api.regenerateLocalApiToken())}>Regenerate Token</Button>
        </div>
      )}
      {error && (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}

function describe(status: LocalApiStatus): string {
  if (!status.enabled) return 'Off. The Keypad plugin can’t control Stint.'
  if (status.problem === 'in-use') {
    return `Another program is using port ${status.port}. Choose a different port.`
  }
  if (status.problem === 'failed') return 'The connection for the Keypad couldn’t start.'
  if (status.clients.length > 0) return `Connected: ${status.clients.join(', ')}.`
  return 'Waiting for the Keypad plugin to connect.'
}
