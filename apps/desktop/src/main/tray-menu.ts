// SPDX-License-Identifier: GPL-3.0-or-later
// What the tray / menu bar shows, as plain data. tray.ts turns this into a real
// Electron menu; keeping it separate means the contents can be unit-tested.
import { formatClock } from '@stint/core'

export interface TrayModel {
  running: {
    projectName: string
    clientName: string
    startedAt: number
  } | null
  favorites: {
    slot: number
    projectId: string
    label: string
    running: boolean
    /** False for archived projects (they can't be started). */
    enabled: boolean
    accelerator: string | null
  }[]
  stopAccelerator: string | null
  switcherAccelerator: string | null
}

export type TrayCommand =
  | { kind: 'stop' }
  | { kind: 'toggle'; projectId: string }
  | { kind: 'switcher' }
  | { kind: 'open' }
  | { kind: 'settings' }
  | { kind: 'quit' }

export interface TrayItem {
  label?: string
  type?: 'normal' | 'separator' | 'checkbox'
  enabled?: boolean
  checked?: boolean
  /** Shown as a hint next to the item (the shortcut itself is registered elsewhere). */
  accelerator?: string
  command?: TrayCommand
}

/** `formatTime` turns a timestamp into a local time like "2:14 PM". */
export function trayMenuItems(model: TrayModel, formatTime: (ms: number) => string): TrayItem[] {
  const items: TrayItem[] = []
  const hint = (a: string | null) => (a ? { accelerator: a } : {})

  if (model.running) {
    const { projectName, clientName, startedAt } = model.running
    items.push({ label: `${projectName} · ${clientName}`, enabled: false })
    items.push({ label: `Running since ${formatTime(startedAt)}`, enabled: false })
    items.push({ label: 'Stop timer', command: { kind: 'stop' }, ...hint(model.stopAccelerator) })
  } else {
    items.push({ label: 'No timer running', enabled: false })
  }

  items.push({ type: 'separator' })
  if (model.favorites.length === 0) {
    items.push({ label: 'No favorites yet', enabled: false })
    items.push({ label: 'Set up favorites…', command: { kind: 'settings' } })
  } else {
    for (const fav of model.favorites) {
      items.push({
        label: `${fav.slot}. ${fav.label}`,
        type: 'checkbox',
        checked: fav.running,
        enabled: fav.enabled || fav.running,
        command: { kind: 'toggle', projectId: fav.projectId },
        ...hint(fav.accelerator),
      })
    }
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Quick switcher…',
    command: { kind: 'switcher' },
    ...hint(model.switcherAccelerator),
  })
  items.push({ label: 'Open Stint', command: { kind: 'open' } })
  items.push({ label: 'Settings…', command: { kind: 'settings' } })
  items.push({ type: 'separator' })
  items.push({ label: 'Quit Stint', command: { kind: 'quit' } })
  return items
}

/** macOS menu bar text next to the icon: hours:minutes while running, else nothing. */
export function trayTitle(model: TrayModel, now: number): string {
  if (!model.running) return ''
  const [h, m] = formatClock(now - model.running.startedAt).split(':')
  return `${h}:${m}`
}

/** Windows tooltip (and the macOS hover text). */
export function trayTooltip(model: TrayModel, now: number): string {
  if (!model.running) return 'Stint: no timer running'
  const { projectName, clientName, startedAt } = model.running
  return `Stint: ${projectName} · ${clientName} (${formatClock(now - startedAt)})`
}
