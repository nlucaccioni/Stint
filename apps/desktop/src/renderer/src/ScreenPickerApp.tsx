// SPDX-License-Identifier: GPL-3.0-or-later
// The screen color picker overlay (see main/screen-picker.ts): one per display. It
// shows that display's screenshot full size, so it looks like the real screen, and
// draws a magnifier under the cursor. Click picks the center pixel; Esc or
// right-click cancels.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { rgbToHex } from '@stint/core'
import type { ScreenCapture } from '../../shared/api'
import { api } from './api'
import styles from './ScreenPickerApp.module.css'

/** Pixels shown across the magnifier (odd, so there's a center pixel). */
const GRID = 11
/** Screen pixels per magnified pixel. */
const ZOOM = 12
const LOUPE = GRID * ZOOM

export function ScreenPickerApp({ displayId }: { displayId: number }) {
  const screenRef = useRef<HTMLCanvasElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const [capture, setCapture] = useState<ScreenCapture | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [hex, setHex] = useState('#000000')

  // The window is transparent until the screenshot is drawn, so the real screen
  // shows through instead of a flash of the app background.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => {
    void api.getScreenCapture(displayId).then((c) => {
      if (c) setCapture(c)
      else void api.finishScreenColorPick(null)
    })
  }, [displayId])

  // Draw the screenshot once it arrives.
  useEffect(() => {
    const canvas = screenRef.current
    if (!canvas || !capture) return
    canvas.width = capture.width
    canvas.height = capture.height
    const pixels = new Uint8ClampedArray(capture.pixels)
    canvas.getContext('2d')!.putImageData(new ImageData(pixels, capture.width), 0, 0)
  }, [capture])

  // Esc cancels, from anywhere in the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void api.finishScreenColorPick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** CSS position → screenshot pixel (the screenshot is at device resolution). */
  function pixelAt(x: number, y: number) {
    if (!capture) return null
    return {
      px: Math.min(capture.width - 1, Math.floor((x / window.innerWidth) * capture.width)),
      py: Math.min(capture.height - 1, Math.floor((y / window.innerHeight) * capture.height)),
    }
  }

  function colorAt(px: number, py: number): string {
    const i = (py * capture!.width + px) * 4
    const p = capture!.pixels
    return rgbToHex({ r: p[i]!, g: p[i + 1]!, b: p[i + 2]! })
  }

  function onMove(e: PointerEvent) {
    const at = pixelAt(e.clientX, e.clientY)
    if (!at) return
    setCursor({ x: e.clientX, y: e.clientY })
    setHex(colorAt(at.px, at.py))
    drawLoupe(at.px, at.py)
  }

  function drawLoupe(px: number, py: number) {
    const loupe = loupeRef.current
    const source = screenRef.current
    if (!loupe || !source) return
    const ctx = loupe.getContext('2d')!
    const half = Math.floor(GRID / 2)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, LOUPE, LOUPE)
    ctx.drawImage(source, px - half, py - half, GRID, GRID, 0, 0, LOUPE, LOUPE)
    // Faint grid, so single pixels are easy to see.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.08)'
    ctx.lineWidth = 1
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath()
      ctx.moveTo(i * ZOOM + 0.5, 0)
      ctx.lineTo(i * ZOOM + 0.5, LOUPE)
      ctx.moveTo(0, i * ZOOM + 0.5)
      ctx.lineTo(LOUPE, i * ZOOM + 0.5)
      ctx.stroke()
    }
    // The pixel that will be picked.
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.strokeRect(half * ZOOM, half * ZOOM, ZOOM, ZOOM)
  }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault()
    if (e.button === 2) return void api.finishScreenColorPick(null)
    if (e.button !== 0) return
    const at = pixelAt(e.clientX, e.clientY)
    void api.finishScreenColorPick(at ? colorAt(at.px, at.py) : null)
  }

  // Keep the magnifier on screen: it sits below-right of the cursor, and flips
  // to the other side near the right or bottom edge.
  const gap = 16
  const loupeLeft =
    cursor && cursor.x + gap + LOUPE > window.innerWidth
      ? cursor.x - gap - LOUPE
      : (cursor?.x ?? 0) + gap
  const loupeTop =
    cursor && cursor.y + gap + LOUPE + 32 > window.innerHeight
      ? cursor.y - gap - LOUPE - 32
      : (cursor?.y ?? 0) + gap

  return (
    <div
      className={styles.overlay}
      onPointerMove={onMove}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={screenRef} className={styles.screen} />
      <div
        className={styles.loupe}
        style={{ left: loupeLeft, top: loupeTop, visibility: cursor ? 'visible' : 'hidden' }}
      >
        <canvas ref={loupeRef} width={LOUPE} height={LOUPE} className={styles.zoom} />
        <div className={styles.label}>
          <span className={styles.swatch} style={{ background: hex }} />
          {hex.toUpperCase()}
        </div>
      </div>
    </div>
  )
}
