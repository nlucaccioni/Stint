// SPDX-License-Identifier: GPL-3.0-or-later
// The app menu. On macOS it's the menu bar at the top of the screen. On Windows
// and Linux the window has no menu bar; the same menu opens from the menu button
// in Stint's title bar. It stays installed either way so its keyboard shortcuts
// (copy/paste, zoom, reload) keep working.
import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

export interface AppMenuDeps {
  checkForUpdates: () => void
}

export function installAppMenu(deps: AppMenuDeps): void {
  const checkForUpdates: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => deps.checkForUpdates(),
  }
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            role: 'appMenu',
            submenu: [
              { role: 'about' },
              checkForUpdates,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
          { role: 'fileMenu' },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' },
        ]
      : [
          {
            label: 'File',
            // "Close" only hides the window (Stint keeps running in the tray), so Quit is spelled out.
            submenu: [
              { role: 'close' },
              { type: 'separator' },
              { role: 'quit', label: 'Quit Stint' },
            ],
          },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' },
          { type: 'separator' },
          checkForUpdates,
        ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Open the app menu under the title bar's menu button (Windows/Linux). */
export function popUpAppMenu(win: BrowserWindow, x: number, y: number): void {
  Menu.getApplicationMenu()?.popup({ window: win, x, y })
}
