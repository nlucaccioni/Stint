// SPDX-License-Identifier: GPL-3.0-or-later
// The tray icon (Windows) / menu bar item (macOS). The menu is rebuilt each time
// it's opened, so it always reflects current projects and favorites; only the
// small title/tooltip text is updated on a timer while a timer runs.
import { join } from 'node:path'
import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import {
  trayMenuItems,
  trayTitle,
  trayTooltip,
  type TrayCommand,
  type TrayModel,
} from './tray-menu'

export interface TrayDeps {
  getModel: () => TrayModel
  onCommand: (command: TrayCommand) => void
  /** Windows: a left click opens the window. */
  onOpen: () => void
}

export interface TrayHandle {
  /** Update the title/tooltip now (call after the timer changes). */
  refresh: () => void
}

export function createTray(deps: TrayDeps): TrayHandle {
  const isMac = process.platform === 'darwin'
  // Icons live in apps/desktop/resources; Electron reads them from inside the app bundle too.
  const icon = nativeImage.createFromPath(
    join(app.getAppPath(), 'resources', isMac ? 'trayTemplate.png' : 'tray.png'),
  )
  // A "template" image is black + transparency; macOS recolors it for light/dark menu bars.
  if (isMac) icon.setTemplateImage(true)
  const tray = new Tray(icon)

  function showMenu() {
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    const items = trayMenuItems(deps.getModel(), (ms) => timeFormat.format(ms))
    const template: MenuItemConstructorOptions[] = items.map((item) => ({
      label: item.label,
      type: item.type,
      enabled: item.enabled,
      checked: item.checked,
      accelerator: item.accelerator,
      // Only show the shortcut as a hint; it's registered globally by the hotkey service.
      registerAccelerator: false,
      click: item.command ? () => deps.onCommand(item.command!) : undefined,
    }))
    tray.popUpContextMenu(Menu.buildFromTemplate(template))
  }

  let ticker: ReturnType<typeof setInterval> | null = null
  function refresh() {
    const model = deps.getModel()
    const update = () => {
      const now = Date.now()
      if (isMac) tray.setTitle(trayTitle(model, now), { fontType: 'monospacedDigit' })
      tray.setToolTip(trayTooltip(model, now))
    }
    update()
    if (ticker) clearInterval(ticker)
    ticker = model.running ? setInterval(update, 1000) : null
  }

  if (isMac) {
    tray.on('click', showMenu)
    tray.on('right-click', showMenu)
  } else {
    tray.on('click', deps.onOpen)
    tray.on('right-click', showMenu)
  }
  refresh()
  return { refresh }
}
