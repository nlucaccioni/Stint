// SPDX-License-Identifier: GPL-3.0-or-later
// Electron main process: the Node.js side of the app. It owns windows, the
// database, and (later) the timer engine. The UI runs in a separate, sandboxed renderer
// process and can only reach this code through the preload bridge.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, Notification, powerMonitor, session, shell } from 'electron'
import { formatClock } from '@stint/core'
import {
  eventChannel,
  type AppInfo,
  type EventName,
  type IdleAway,
  type StintEvents,
} from '../shared/api'
import { createApiHandlers } from './api'
import { openDatabase, type Db } from './db/connection'
import { getPreferences } from './db/preferences'
import { getProject } from './db/projects'
import { getRunningSession } from './db/sessions'
import { loadDeviceSettings } from './device'
import { IdleWatcher } from './idle'
import { registerIpc } from './ipc'
import { NudgeWatcher } from './nudge'

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

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 480,
    minHeight: 400,
    show: false,
    title: 'Stint',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Security baseline (SPEC.md §4): the page gets no Node.js access, runs in
      // a sandbox, and sees only what the preload script explicitly exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // The app never navigates away from its own page or opens new windows.
  // Regular web links open in the user's browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  // In dev, echo the page's console (errors, warnings) to the terminal running `pnpm dev`.
  if (!app.isPackaged) {
    win.webContents.on('console-message', ({ level, message }) => {
      console.log(`[renderer:${level}] ${message}`)
    })
  }

  // In dev, electron-vite serves the renderer with hot reload; in a build it's a local file.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

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
      notification.on('click', showMainWindow)
      notification.show()
    },
  })
  setInterval(() => watcher.tick(), 60_000)
  watcher.tick()
}

/** Bring the main window to the front, creating it if it was closed. */
function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => (mainWindow = null))
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** Send an event to every window (the change may have come from elsewhere). */
function broadcast<E extends EventName>(event: E, payload: StintEvents[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(eventChannel(event), payload)
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

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
    registerIpc(
      createApiHandlers({
        db,
        deviceId: device.deviceId,
        appInfo,
        onTimerChanged: (state) => {
          broadcast('timerChanged', state)
          // A prompt about a session that's no longer running doesn't apply any more.
          if (pendingIdle && state.running?.id !== pendingIdle.sessionId) setPendingIdle(null)
        },
        onSessionsChanged: () => broadcast('sessionsChanged', null),
        onPreferencesChanged: (prefs) => broadcast('preferencesChanged', prefs),
        saveFile,
        revealFile: (path) => shell.showItemInFolder(path),
        pendingIdle: { get: () => pendingIdle, clear: () => setPendingIdle(null) },
      }),
    )
    startIdleWatcher(db)
    startNudgeWatcher(db)
  } catch (error) {
    dialog.showErrorBox('Stint could not open its data', String(error))
    app.exit(1)
    return
  }

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => (mainWindow = null))

  // macOS: clicking the dock icon with no windows open reopens the main window.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
})

app.on('will-quit', () => {
  db?.close()
  db = null
})

// macOS apps usually stay running when their last window closes; Windows apps quit.
// (Phase 2 changes this: Stint will keep running in the tray/menu bar on both.)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
