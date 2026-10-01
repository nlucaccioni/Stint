// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import type { Session, TimeRange } from '@stint/core'
import { api, onEvent } from './api'

/** Sessions overlapping `range`, reloaded whenever any session changes. */
export function useSessions(range: TimeRange) {
  const [sessions, setSessions] = useState<Session[]>([])
  const { start, end } = range

  useEffect(() => {
    let active = true
    const load = () =>
      void api.listSessions({ start, end }).then((list) => active && setSessions(list))
    load()
    const unsubscribe = onEvent('sessionsChanged', load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [start, end])

  return sessions
}
