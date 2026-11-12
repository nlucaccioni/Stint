// SPDX-License-Identifier: GPL-3.0-or-later
// A brief "✓ Saved" that fades in after a setting saves, then out again.
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import styles from './SavedNote.module.css'

/** Always in the page so it can fade out; screen readers hear "Saved" when it appears. */
export function SavedNote({ shown }: { shown: boolean }) {
  return (
    <>
      <span className={styles.saved} data-shown={shown || undefined} aria-hidden>
        <Check size={14} /> Saved
      </span>
      <span className={styles.visuallyHidden} role="status">
        {shown ? 'Saved' : ''}
      </span>
    </>
  )
}

/**
 * Which part of a page just saved, for a couple of seconds. `show('timer')` after
 * a save; `shownIn('timer')` decides whether that section's SavedNote shows.
 */
export function useSavedFlash() {
  const [section, setSection] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    shownIn: (name: string) => section === name,
    show: (name: string) => {
      setSection(name)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSection(null), 2000)
    },
  }
}
