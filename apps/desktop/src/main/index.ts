// SPDX-License-Identifier: GPL-3.0-or-later
// Electron main process: the Node.js side of the app. It owns windows, the
// database, the tray, global shortcuts, and background watchers. The UI runs in a
// separate, sandboxed renderer process and can only reach this code through the
// preload bridge.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  nativeTheme,
  Notification,
  powerMonitor,
  session,
  shell,
} from 'electron'
import { formatClock } from '@stint/core'
import {
  eventChannel,
  type AppInfo,
  type AppView,
  type EventName,
  type IdleAway,
  type StintEvents,
} from '../shared/api'
import type { HotkeyAction, Platform } from '../shared/hotkeys'
import { createApiHandlers, type ApiHandlers } from './api'
import { installAppMenu, popUpAppMenu } from './app-menu'
import { openDatabase, type Db } from './db/connection'
import { getClient } from './db/clients'
import { getPreferences } from './db/preferences'
import { getProject } from './db/projects'
import { getRunningSession } from './db/sessions'
import { loadDeviceSettings, saveDeviceSettings, type DeviceSettings } from './device'
import { HotkeyService } from './hotkeys'
import { createTray, type TrayHandle } from './tray'
import type { TrayCommand, TrayModel } from './tray-menu'
import { IdleWatcher } from './idle'
import { registerIpc } from './ipc'
import { NudgeWatcher } from './nudge'
import { hideSwitcher, showSwitcher } from './switcher'
import { checkForUpdatesNow, startUpdateChecks } from './updates'
import { createSecureWindow, loadRenderer } from './windows'

// Where the database and settings live. Dev runs use a separate folder so testing
// never touches real time data. This must be set before anything else reads it.
// macOS: ~/Library/Application Support/Stint   Windows: %APPDATA%\Stint
app.setPath('userData', join(app.getPath('appData'), app.isPackaged ? 'Stint' : 'Stint Dev'))

// Two copies of Stint writing to one database would conflict, so only allow one.
// A second launch just focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let db: Db | null = null
/** An absence waiting for the user to decide what to do with it. */
let pendingIdle: IdleAway | null = null
let tray: TrayHandle | null = null
/** Set when the user really quits (tray "Quit", Cmd+Q). Until then, closing hides. */
let quitting = false
/** Shows the Windows "still running in the tray" notice once; set up after startup. */
let onFirstHide: () => void = () => {}

/** Must match the title bar height in renderer TitleBar.module.css. */
const TITLE_BAR_HEIGHT = 36

/** Starting colors for the window buttons; the renderer swaps in the design tokens on load. */
function titleBarColors(): { color: string; symbolColor: string } {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#161616', symbolColor: '#ededed' }
    : { color: '#ffffff', symbolColor: '#1a1a1a' }
}

function createMainWindow(): BrowserWindow {
  const win = createSecureWindow({
    width: 1000,
    height: 700,
    minWidth: 480,
    minHeight: 400,
    show: false,
    title: 'Stint',
    // Stint draws its own title bar (renderer TitleBar.tsx) so it can hold the menu
    // button. Windows still draws minimize/maximize/close at the top right, over
    // the page ("title bar overlay"); macOS keeps its traffic lights, inset.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarOverlay: { height: TITLE_BAR_HEIGHT, ...titleBarColors() } }),
  })

  win.once('ready-to-show', () => {
    if (!startHidden) win.show()
  })

  // Closing the window keeps Stint running in the tray / menu bar so the timer and
  // shortcuts keep working. Only "Quit" actually exits.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
    onFirstHide()
  })

  loadRenderer(win)
  return win
}

/** Native "Save as" dialog (starting in Documents), then write the file. */
async function saveFile(suggestedName: string, contents: string): Promise<string | null> {
  const options = {
    defaultPath: join(app.getPath('documents'), suggestedName),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, contents, 'utf8')
  return result.filePath
}

function setPendingIdle(away: IdleAway | null): void {
  pendingIdle = away
  broadcast('idleChanged', away)
  if (away) showMainWindow()
}

/**
 * Poll system idle time while a timer runs, and treat sleep and screen lock as
 * being away. When the user returns after the threshold, ask what to do.
 */
function startIdleWatcher(database: Db): void {
  const watcher = new IdleWatcher({
    systemIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    now: () => Date.now(),
    thresholdMs: () => getPreferences(database).idleMinutes * 60_000,
    runningSessionId: () => getRunningSession(database)?.id ?? null,
    onReturn: setPendingIdle,
  })
  setInterval(() => watcher.tick(), 5_000)
  powerMonitor.on('suspend', () => watcher.suspend())
  powerMonitor.on('lock-screen', () => watcher.suspend())
  powerMonitor.on('resume', () => watcher.resume())
  powerMonitor.on('unlock-screen', () => watcher.resume())
}

/** What each global shortcut does. Problems are reported as notifications. */
function runHotkey(action: HotkeyAction, database: Db, handlers: ApiHandlers): void {
  try {
    if (action === 'stop') {
      handlers.stopTimer()
    } else if (action === 'switcher') {
      showSwitcher()
    } else {
      const slot = Number(action.slice('favorite'.length))
      const projectId = getPreferences(database).favorites[slot - 1]
      if (!projectId) {
        notify(`Favorite ${slot} is empty`, 'Choose a project for it in Settings.')
        return
      }
      handlers.toggleTimer(projectId)
    }
  } catch (error) {
    notify("Couldn't do that", error instanceof Error ? error.message : String(error))
  }
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => showMainWindow())
  n.show()
}

/** Update and save device-local settings. */
function saveDevice(dir: string, device: DeviceSettings, changes: Partial<DeviceSettings>): void {
  Object.assign(device, changes)
  saveDeviceSettings(dir, device)
}

/** Remind once when a timer has been running longer than the preference allows. */
function startNudgeWatcher(database: Db): void {
  const watcher = new NudgeWatcher({
    now: () => Date.now(),
    thresholdMs: () => getPreferences(database).nudgeHours * 3_600_000,
    running: () => getRunningSession(database),
    notify: (running, elapsed) => {
      if (!Notification.isSupported()) return
      const project = getProject(database, running.projectId)
      const notification = new Notification({
        title: 'Timer still running',
        body: `${project?.name ?? 'Your timer'} has been running for ${formatClock(elapsed)}. Forgot to stop it?`,
      })
      notification.on('click', () => showMainWindow())
      notification.show()
    },
  })
  setInterval(() => watcher.tick(), 60_000)
  watcher.tick()
}

/** Bring the main window to the front (creating it if needed), optionally on a tab. */
function showMainWindow(view?: AppView): void {
  startHidden = false
  if (!mainWindow) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => (mainWindow = null))
    if (view) {
      const win = mainWindow
      win.webContents.once('did-finish-load', () =>
        win.webContents.send(eventChannel('navigate'), view),
      )
    }
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (view) broadcast('navigate', view)
}

/** What the tray menu shows, read fresh from the database. */
function trayModel(database: Db, hotkeys: HotkeyService): TrayModel {
  const running = getRunningSession(database)
  const runningProject = running ? getProject(database, running.projectId) : null
  const runningClient = runningProject ? getClient(database, runningProject.clientId) : null
  const bindings = hotkeys.bindings()
  const favorites: TrayModel['favorites'] = []
  getPreferences(database).favorites.forEach((projectId, i) => {
    const project = projectId ? getProject(database, projectId) : null
    if (!project || project.deletedAt !== null) return
    const client = getClient(database, project.clientId)
    favorites.push({
      slot: i + 1,
      projectId: project.id,
      label: `${project.name} · ${client?.name ?? '?'}`,
      running: running?.projectId === project.id,
      enabled: !project.archived && !client?.archived,
      accelerator: bindings[`favorite${i + 1}` as HotkeyAction],
    })
  })
  return {
    running:
      running && runningProject
        ? {
            projectName: runningProject.name,
            clientName: runningClient?.name ?? '?',
            startedAt: running.startedAt,
          }
        : null,
    favorites,
    stopAccelerator: bindings.stop,
    switcherAccelerator: bindings.switcher,
  }
}

function runTrayCommand(command: TrayCommand, handlers: ApiHandlers): void {
  try {
    switch (command.kind) {
      case 'stop':
        handlers.stopTimer()
        break
      case 'toggle':
        handlers.toggleTimer(command.projectId)
        break
      case 'switcher':
        showSwitcher()
        break
      case 'open':
        showMainWindow()
        break
      case 'settings':
        showMainWindow('settings')
        break
      case 'quit':
        app.quit()
        break
    }
  } catch (error) {
    notify("Couldn't do that", error instanceof Error ? error.message : String(error))
  }
}

/** Send an event to every window (the change may have come from elsewhere). */
function broadcast<E extends EventName>(event: E, payload: StintEvents[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(eventChannel(event), payload)
  }
}

app.on('second-instance', () => showMainWindow())

/**
 * Launched by "launch at login": start quietly in the tray. Windows passes our
 * --hidden argument; macOS reports it through getLoginItemSettings.
 */
let startHidden =
  process.argv.includes('--hidden') ||
  (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)

void app.whenReady().then(() => {
  // Windows uses this ID to group taskbar icons and show notifications.
  app.setAppUserModelId('com.nlucaccioni.stint')

  // Stint never needs camera, mic, location, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))

  try {
    const dataDir = app.getPath('userData')
    const device = loadDeviceSettings(dataDir)
    db = openDatabase(join(dataDir, 'stint.db'))
    if (!app.isPackaged) console.log(`[stint] data: ${dataDir}  device: ${device.deviceId}`)

    const appInfo: AppInfo = {
      version: app.getVersion(),
      platform: process.platform as AppInfo['platform'],
    }
    const hotkeys = new HotkeyService({
      registry: globalShortcut,
      platform: process.platform as Platform,
      overrides: device.hotkeys ?? {},
      save: (overrides) => saveDevice(dataDir, device, { hotkeys: overrides }),
      onAction: (action) => runHotkey(action, db!, handlers),
    })
    const handlers: ApiHandlers = createApiHandlers({
      db,
      deviceId: device.deviceId,
      appInfo,
      onTimerChanged: (state) => {
        broadcast('timerChanged', state)
        tray?.refresh()
        // A prompt about a session that's no longer running doesn't apply any more.
        if (pendingIdle && state.running?.id !== pendingIdle.sessionId) setPendingIdle(null)
      },
      onSessionsChanged: () => {
        broadcast('sessionsChanged', null)
        tray?.refresh()
      },
      onPreferencesChanged: (prefs) => broadcast('preferencesChanged', prefs),
      onBatchesChanged: () => broadcast('batchesChanged', null),
      saveFile,
      revealFile: (path) => shell.showItemInFolder(path),
      pendingIdle: { get: () => pendingIdle, clear: () => setPendingIdle(null) },
      hotkeys,
      loginItem: {
        get: () => ({
          enabled: app.getLoginItemSettings().openAtLogin,
          available: app.isPackaged,
        }),
        set: (enabled) =>
          app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? ['--hidden'] : [] }),
      },
      hideSwitcher,
      titleBar: {
        showMenu: (x, y) => {
          if (mainWindow) popUpAppMenu(mainWindow, x, y)
        },
        setColors: (color, symbolColor) => {
          if (process.platform !== 'darwin') mainWindow?.setTitleBarOverlay({ color, symbolColor })
        },
      },
    })
    registerIpc(handlers)
    installAppMenu({ checkForUpdates: checkForUpdatesNow })
    hotkeys.apply()
    const database = db
    tray = createTray({
      getModel: () => trayModel(database, hotkeys),
      onCommand: (command) => runTrayCommand(command, handlers),
      onOpen: () => showMainWindow(),
    })
    // Windows users may not know to look in the tray, so explain once.
    onFirstHide = () => {
      if (process.platform !== 'win32' || device.trayNoticeShown) return
      notify('Stint is still running', 'It keeps timing in the tray. Right-click the icon to quit.')
      saveDevice(dataDir, device, { trayNoticeShown: true })
    }
    startIdleWatcher(db)
    startNudgeWatcher(db)
    startUpdateChecks()
  } catch (error) {
    dialog.showErrorBox('Stint could not open its data', String(error))
    app.exit(1)
    return
  }

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => (mainWindow = null))

  // macOS: clicking the dock icon brings the (possibly hidden) window back.
  app.on('activate', () => showMainWindow())
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  db?.close()
  db = null
})

// Stint lives in the tray / menu bar, so it keeps running with no windows open.
app.on('window-all-closed', () => {})
