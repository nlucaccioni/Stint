// SPDX-License-Identifier: GPL-3.0-or-later
// Stint's own screen color picker (Windows/Linux). Electron's built-in EyeDropper
// picks anywhere on screen but, outside the app, shows no magnifier and lets the
// click go through to whatever is underneath. So instead:
//
//   1. Screenshot every display.
//   2. Cover each display with a borderless, always-on-top window showing its
//      screenshot. It looks like the screen, but clicks land on Stint.
//   3. That window (renderer ScreenPickerApp) draws a magnifier under the cursor;
//      a click reports the pixel's color, Esc or right-click cancels.
//
// macOS keeps the system picker, which already does all of this.
import { desktopCapturer, screen, type BrowserWindow } from 'electron'
import type { ScreenCapture } from '../shared/api'
import { createSecureWindow, loadRenderer } from './windows'

interface PickSession {
  captures: Map<number, ScreenCapture>
  windows: BrowserWindow[]
  resolve: (hex: string | null) => void
}

let session: PickSession | null = null

/** Resolves with the picked "#rrggbb", or null if cancelled. */
export async function pickScreenColor(): Promise<string | null> {
  finishScreenPick(null) // only one pick at a time
  const displays = screen.getAllDisplays()
  const captures = await captureDisplays()

  return new Promise((resolve) => {
    const windows = displays
      .filter((d) => captures.has(d.id))
      .map((d) => {
        const win = createSecureWindow({
          ...d.bounds,
          show: false,
          frame: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          hasShadow: false,
          enableLargerThanScreen: true,
          // See-through until the page draws the screenshot: no flash.
          transparent: true,
          backgroundColor: '#00000000',
          title: 'Stint Color Picker',
        })
        // Above everything, taskbar included.
        win.setAlwaysOnTop(true, 'screen-saver')
        win.once('ready-to-show', () => {
          win.setBounds(d.bounds)
          win.show()
          // Keyboard focus (for Esc) goes to the display with the cursor.
          if (screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id === d.id) win.focus()
        })
        // Closed some other way (Alt+F4): treat as a cancel.
        win.on('closed', () => finishScreenPick(null))
        loadRenderer(win, `screen-picker-${d.id}`)
        return win
      })
    if (windows.length === 0) return resolve(null)
    session = { captures, windows, resolve }
  })
}

/** The screenshot for one overlay window to draw. */
export function screenCapture(displayId: number): ScreenCapture | null {
  return session?.captures.get(displayId) ?? null
}

/** Called by an overlay with the picked color (or null): closes every overlay. */
export function finishScreenPick(hex: string | null): void {
  const current = session
  if (!current) return
  session = null
  for (const w of current.windows) if (!w.isDestroyed()) w.destroy()
  current.resolve(hex)
}

/** Each display's screenshot at its full (physical) resolution, as RGBA pixels. */
async function captureDisplays(): Promise<Map<number, ScreenCapture>> {
  const displays = screen.getAllDisplays()
  const physical = (d: Electron.Display) => ({
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
  })
  const largest = displays.map(physical).reduce((a, b) => ({
    width: Math.max(a.width, b.width),
    height: Math.max(a.height, b.height),
  }))
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: largest })

  const captures = new Map<number, ScreenCapture>()
  displays.forEach((d, i) => {
    // display_id links a source to its display; fall back to order if it's missing.
    const source = sources.find((s) => s.display_id === String(d.id)) ?? sources[i]
    if (!source) return
    const size = physical(d)
    const image = source.thumbnail.resize(size)
    const actual = image.getSize()
    captures.set(d.id, {
      width: actual.width,
      height: actual.height,
      pixels: bgraToRgba(image.toBitmap()),
    })
  })
  return captures
}

/** nativeImage bitmaps are BGRA; canvas ImageData wants RGBA. */
function bgraToRgba(bgra: Buffer): Uint8Array {
  const out = new Uint8Array(bgra.length)
  for (let i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2]!
    out[i + 1] = bgra[i + 1]!
    out[i + 2] = bgra[i]!
    out[i + 3] = 255
  }
  return out
}
