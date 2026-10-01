// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import { defaultPreferences, type Preferences } from '@stint/core'
import { api, onEvent } from './api'

/** Synced preferences, kept current by `preferencesChanged` events. */
export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void api.getPreferences().then((p) => {
      if (!active) return
      setPrefs(p)
      setLoaded(true)
    })
    const unsubscribe = onEvent('preferencesChanged', setPrefs)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return {
    preferences: prefs,
    loaded,
    update: async (edits: Partial<Preferences>) => setPrefs(await api.updatePreferences(edits)),
  }
}
