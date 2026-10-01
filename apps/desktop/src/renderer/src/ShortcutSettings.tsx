// SPDX-License-Identifier: GPL-3.0-or-later
// Settings section for global keyboard shortcuts (desktop only).
import { useEffect, useState } from 'react'
import { Button } from '@stint/ui'
import type { HotkeyState, HotkeyStatus } from '../../shared/api'
import {
  acceleratorFromKeyPress,
  formatAccelerator,
  hotkeyActions,
  hotkeyLabel,
  normalizeAccelerator,
  type HotkeyAction,
  type Platform,
} from '../../shared/hotkeys'
import { api } from './api'
import styles from './ShortcutSettings.module.css'

const PROBLEMS: Record<NonNullable<HotkeyStatus['problem']>, string> = {
  'in-use': 'Another app is using this shortcut.',
  duplicate: 'Another Stint action already uses this shortcut.',
  invalid: "This shortcut can't be used.",
}

export function ShortcutSettings({ platform }: { platform: Platform }) {
  const [state, setState] = useState<HotkeyState | null>(null)
  const [recording, setRecording] = useState<HotkeyAction | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.getHotkeys().then((s) => active && setState(s))
    return () => {
      active = false
    }
  }, [])

  // While recording, Stint's own shortcuts are released so the keys reach this page.
  useEffect(() => {
    if (!recording) return
    const action = recording
    void api.pauseHotkeys(true)

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      if (e.code === 'Escape' && plain) {
        setRecording(null)
        return
      }
      const result = acceleratorFromKeyPress(e, platform)
      if (result.kind === 'invalid') setHint(result.reason)
      if (result.kind !== 'accelerator') return
      setRecording(null)
      void api.setHotkey(action, result.accelerator).then(setState)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      setHint(null)
      void api.pauseHotkeys(false).then(setState)
    }
  }, [recording, platform])

  if (!state) return null

  const label = (accelerator: string | null) =>
    accelerator ? formatAccelerator(accelerator, platform) : 'None'

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Keyboard shortcuts</h2>
        <Button size="sm" variant="ghost" onClick={() => void api.resetHotkeys().then(setState)}>
          Reset all to defaults
        </Button>
      </div>
      <p className={styles.intro}>
        These work from any app. Favorite shortcuts start that project, switch to it, or stop it if
        it's already running.
      </p>
      <ul className={styles.list}>
        {hotkeyActions.map((action) => {
          const accelerator = state.bindings[action]
          const fallback = state.defaults[action]
          const isDefault =
            accelerator !== null &&
            fallback !== null &&
            normalizeAccelerator(accelerator) === normalizeAccelerator(fallback)
          const status = state.status[action]
          const isRecording = recording === action
          return (
            <li key={action} className={styles.row}>
              <span className={styles.action}>{hotkeyLabel(action)}</span>
              <span className={styles.binding}>
                <kbd className={styles.kbd} data-recording={isRecording || undefined}>
                  {isRecording ? 'Press a shortcut… (Esc to cancel)' : label(accelerator)}
                </kbd>
                {isRecording && hint && <span className={styles.problem}>{hint}</span>}
                {!isRecording && !status?.ok && status?.problem && (
                  <span className={styles.problem} role="alert">
                    {PROBLEMS[status.problem]}
                  </span>
                )}
              </span>
              <span className={styles.buttons}>
                <Button size="sm" onClick={() => setRecording(isRecording ? null : action)}>
                  {isRecording ? 'Cancel' : 'Change'}
                </Button>
                {accelerator !== null && !isRecording && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void api.setHotkey(action, null).then(setState)}
                  >
                    Clear
                  </Button>
                )}
                {!isDefault && !isRecording && fallback && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={`Reset to ${label(fallback)}`}
                    onClick={() => void api.setHotkey(action, fallback).then(setState)}
                  >
                    Reset
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
