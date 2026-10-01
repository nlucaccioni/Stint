// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import type { IdleChoice } from '@stint/core'
import type { IdleAway } from '../../shared/api'
import { api, onEvent } from './api'

/** The absence waiting for a decision (from main's idle watcher), if any. */
export function useIdle() {
  const [away, setAway] = useState<IdleAway | null>(null)

  useEffect(() => {
    let active = true
    void api.getPendingIdle().then((a) => active && setAway(a))
    const unsubscribe = onEvent('idleChanged', setAway)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return {
    away,
    resolve: async (choice: IdleChoice) => {
      await api.resolveIdle(choice)
      setAway(null)
    },
  }
}
