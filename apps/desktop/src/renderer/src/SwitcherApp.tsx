// SPDX-License-Identifier: GPL-3.0-or-later
// The page shown in the quick switcher window (index.html#switcher).
import { useEffect, useState } from 'react'
import { QuickSwitcher } from '@stint/ui'
import { api, onEvent } from './api'
import { useCatalog } from './useCatalog'
import { usePreferences } from './usePreferences'
import { useTimer } from './useTimer'

export function SwitcherApp() {
  const catalog = useCatalog()
  const timer = useTimer()
  const prefs = usePreferences()
  const [recent, setRecent] = useState<string[]>([])
  // Bumped each time the window opens, so the palette starts fresh (empty search).
  const [opened, setOpened] = useState(0)

  useEffect(() => {
    let active = true
    const load = () => void api.listRecentProjectIds(20).then((ids) => active && setRecent(ids))
    load()
    const unsubscribe = onEvent('switcherShown', () => {
      setOpened((n) => n + 1)
      load()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!catalog.loaded) return null

  return (
    <QuickSwitcher
      key={opened}
      projects={catalog.projects}
      clients={catalog.clients}
      running={timer.running}
      favorites={prefs.preferences.favorites}
      recentProjectIds={recent}
      onToggle={timer.toggle}
      onStop={timer.stop}
      onClose={() => void api.hideSwitcher()}
    />
  )
}
