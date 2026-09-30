// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'

/**
 * The current time, re-rendering every `intervalMs` while `active`. Used for live
 * clocks: elapsed time is always computed from `startedAt`, never counted up, so
 * it stays correct after sleep, lag, or a restart.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, intervalMs)
    // Also refresh as soon as the window becomes visible again.
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active, intervalMs])
  return now
}
