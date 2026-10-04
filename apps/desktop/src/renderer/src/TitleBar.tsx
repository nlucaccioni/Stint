// SPDX-License-Identifier: GPL-3.0-or-later
// The window's title bar, drawn by Stint (see createMainWindow). Dragging it moves
// the window. On Windows the menu button opens the app menu (File, Edit, View,
// Window); on macOS that menu lives in the menu bar, so the traffic lights sit here.
import { useEffect } from 'react'
import { Menu } from 'lucide-react'
import type { AppInfo } from '../../shared/api'
import { api } from './api'
import styles from './TitleBar.module.css'

export interface TitleBarProps {
  platform: AppInfo['platform'] | undefined
  version: string | undefined
}

export function TitleBar({ platform, version }: TitleBarProps) {
  const hasMenuButton = platform !== undefined && platform !== 'darwin'

  // Windows draws its own window buttons over the bar; give them the bar's colors,
  // and update them when the system switches between light and dark.
  useEffect(() => {
    if (!hasMenuButton) return
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const css = getComputedStyle(document.documentElement)
      const color = (name: string) => css.getPropertyValue(name).trim()
      void api.setTitleBarColors(color('--color-bg'), color('--color-text'))
    }
    apply()
    dark.addEventListener('change', apply)
    return () => dark.removeEventListener('change', apply)
  }, [hasMenuButton])

  return (
    <div className={styles.bar} data-platform={platform}>
      {hasMenuButton && (
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Menu"
          title="Menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            void api.showAppMenu(Math.round(r.left), Math.round(r.bottom))
          }}
        >
          <Menu size={16} aria-hidden />
        </button>
      )}
      <span className={styles.title}>Stint</span>
      {version && <span className={styles.version}>v{version}</span>}
    </div>
  )
}
