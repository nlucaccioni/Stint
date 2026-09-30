// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react'

/** Runs an async submit, tracking "saving" and turning thrown errors into a message. */
export function useSubmit() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, setError, run }
}
