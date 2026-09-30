// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react'
import type { TimerState } from '../../shared/api'
import { api, onEvent } from './api'

/**
 * The running timer. Loaded on start, then kept current by `timerChanged` events
 * from the main process, which fire for every change wherever it came from.
 */
export function useTimer() {
  const [state, setState] = useState<TimerState>({ running: null })

  useEffect(() => {
    let active = true
    void api.getTimerState().then((s) => active && setState(s))
    const unsubscribe = onEvent('timerChanged', setState)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // Actions also apply their result directly, so the UI never waits on the event.
  const apply = useCallback(async (change: Promise<TimerState>) => setState(await change), [])

  return {
    running: state.running,
    toggle: (projectId: string) => apply(api.toggleTimer(projectId)),
    stop: () => apply(api.stopTimer()),
    stopAt: (at: number) => apply(api.stopTimerAt(at)),
  }
}
