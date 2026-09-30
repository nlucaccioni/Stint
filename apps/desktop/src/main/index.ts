// SPDX-License-Identifier: GPL-3.0-or-later
// Electron main process: the Node.js side of the app. It owns windows and (later)
// the database and timer engine. The UI runs in a separate, sandboxed renderer
// process and can only reach this code through the preload bridge.
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { IpcChannel, type AppInfo } from '../shared/api'
import { openDatabase, type Db } from './db/connection'
import { loadDeviceSettings, type DeviceSettings } from './device'

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
let device: DeviceSettings | null = null

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

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.getAppInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform as AppInfo['platform'],
  }))
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
    device = loadDeviceSettings(dataDir)
    db = openDatabase(join(dataDir, 'stint.db'))
    if (!app.isPackaged) console.log(`[stint] data: ${dataDir}  device: ${device.deviceId}`)
  } catch (error) {
    dialog.showErrorBox('Stint could not open its data', String(error))
    app.exit(1)
    return
  }

  registerIpcHandlers()
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
