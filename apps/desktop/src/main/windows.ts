// SPDX-License-Identifier: GPL-3.0-or-later
// Shared setup for every Stint window: the same security settings, the same
// renderer page (a hash picks the view), and no navigation away from the app.
import { join } from 'node:path'
import { app, BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron'

export function createSecureWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Security baseline (SPEC.md §4): the page gets no Node.js access, runs in
      // a sandbox, and sees only what the preload script explicitly exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

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
  return win
}

/** Load the renderer; `view` selects a screen other than the main window ("switcher"). */
export function loadRenderer(win: BrowserWindow, view?: string): void {
  // In dev, electron-vite serves the renderer with hot reload; in a build it's a local file.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (view ? `#${view}` : ''))
  } else {
    void win.loadFile(
      join(import.meta.dirname, '../renderer/index.html'),
      view ? { hash: view } : {},
    )
  }
}
