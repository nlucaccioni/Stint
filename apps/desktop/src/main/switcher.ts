// SPDX-License-Identifier: GPL-3.0-or-later
// The quick switcher: a small always-on-top palette, opened by shortcut or tray.
// It's created once and kept hidden between uses, so it appears instantly.
import { nativeTheme, screen, type BrowserWindow } from 'electron'
import { eventChannel } from '../shared/api'
import { createSecureWindow, loadRenderer } from './windows'

const WIDTH = 560
const HEIGHT = 380

let win: BrowserWindow | null = null

export function showSwitcher(): void {
  if (!win || win.isDestroyed()) win = create()
  // Center on the display the mouse is on, a little above the middle.
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height * 0.22),
    width: WIDTH,
    height: HEIGHT,
  })
  win.show()
  win.focus()
  // Tell the page to clear the search and reload its data.
  win.webContents.send(eventChannel('switcherShown'), null)
}

export function hideSwitcher(): void {
  if (win && !win.isDestroyed() && win.isVisible()) win.hide()
}

function create(): BrowserWindow {
  const w = createSecureWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Match the page background so there's no white flash in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f5f5f5',
    title: 'Stint quick switcher',
  })
  w.setAlwaysOnTop(true, 'floating')
  // Clicking anywhere else dismisses it, like Spotlight.
  w.on('blur', () => w.hide())
  loadRenderer(w, 'switcher')
  return w
}
