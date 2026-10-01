// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { trayMenuItems, trayTitle, trayTooltip, type TrayModel } from './tray-menu'

const MIN = 60_000
const T0 = 1_000_000_000
const fmt = () => '2:14 PM'

const idle: TrayModel = {
  running: null,
  favorites: [],
  stopAccelerator: 'Control+Shift+Alt+0',
  switcherAccelerator: 'Control+Shift+Alt+K',
}

const running: TrayModel = {
  ...idle,
  running: { projectName: 'Website', clientName: 'Acme', startedAt: T0 },
  favorites: [
    {
      slot: 1,
      projectId: 'p1',
      label: 'Website',
      running: true,
      enabled: true,
      accelerator: 'Control+Shift+Alt+1',
    },
    {
      slot: 3,
      projectId: 'p3',
      label: 'Old thing',
      running: false,
      enabled: false,
      accelerator: null,
    },
  ],
}

const labels = (m: TrayModel) => trayMenuItems(m, fmt).map((i) => i.label ?? '---')

describe('trayMenuItems', () => {
  it('shows an idle state and a way to set up favorites', () => {
    expect(labels(idle)).toEqual([
      'No timer running',
      '---',
      'No favorites yet',
      'Set up favorites…',
      '---',
      'Quick switcher…',
      'Open Stint',
      'Settings…',
      '---',
      'Quit Stint',
    ])
  })

  it('shows the running timer, Stop, and favorites with the running one checked', () => {
    const items = trayMenuItems(running, fmt)
    expect(items.slice(0, 3).map((i) => i.label)).toEqual([
      'Website · Acme',
      'Running since 2:14 PM',
      'Stop timer',
    ])
    expect(items[2]).toMatchObject({
      command: { kind: 'stop' },
      accelerator: 'Control+Shift+Alt+0',
    })
    const favs = items.filter((i) => i.type === 'checkbox')
    expect(favs).toEqual([
      expect.objectContaining({
        label: '1. Website',
        checked: true,
        enabled: true,
        accelerator: 'Control+Shift+Alt+1',
      }),
      expect.objectContaining({ label: '3. Old thing', checked: false, enabled: false }),
    ])
    expect(favs[1]).not.toHaveProperty('accelerator')
  })
})

describe('title and tooltip', () => {
  it('shows hours:minutes in the menu bar only while running', () => {
    expect(trayTitle(idle, T0)).toBe('')
    expect(trayTitle(running, T0 + 83 * MIN + 45_000)).toBe('1:23')
  })

  it('includes seconds in the tooltip', () => {
    expect(trayTooltip(idle, T0)).toBe('Stint: no timer running')
    expect(trayTooltip(running, T0 + 83 * MIN + 45_000)).toBe('Stint: Website · Acme (1:23:45)')
  })
})
