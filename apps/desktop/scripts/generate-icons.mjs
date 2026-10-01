// SPDX-License-Identifier: GPL-3.0-or-later
// Draws Stint's PLACEHOLDER icons (a simple clock) and writes them as PNGs.
// Run: node scripts/generate-icons.mjs   (outputs are committed)
// Replace the PNGs with real artwork any time; this script is only a stand-in.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACCENT = [47, 111, 237] // matches --color-accent (light)

/**
 * Render a clock at `size` px. `style`:
 *  - 'app': white clock on a rounded accent square (app icon)
 *  - 'template': black outline on transparent (macOS menu bar; macOS recolors it)
 *  - 'tray': accent clock with white hands on transparent (Windows tray)
 */
function render(size, style) {
  const px = new Uint8ClampedArray(size * size * 4)
  const SS = 4 // supersampling per axis, for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Coordinates in a -1..1 square
          const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1
          const v = ((y + (sy + 0.5) / SS) / size) * 2 - 1
          const c = sample(u, v, style)
          r += c[0] * c[3]
          g += c[1] * c[3]
          b += c[2] * c[3]
          a += c[3]
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      px[i + 3] = (a / n) * 255
      if (a > 0) {
        px[i] = r / a
        px[i + 1] = g / a
        px[i + 2] = b / a
      }
    }
  }
  return encodePng(size, size, px)
}

/** Color [r,g,b,alpha 0..1] at point (u,v). */
function sample(u, v, style) {
  const dist = Math.hypot(u, v)
  const hand = (len, angleDeg, width) => {
    // Distance from the segment from center to the hand tip.
    const t = (angleDeg * Math.PI) / 180
    const ex = Math.sin(t) * len,
      ey = -Math.cos(t) * len
    const k = Math.max(0, Math.min(1, (u * ex + v * ey) / (ex * ex + ey * ey)))
    return Math.hypot(u - ex * k, v - ey * k) < width
  }
  const hands = (w) => hand(0.45, 0, w) || hand(0.32, 120, w) || Math.hypot(u, v) < w * 1.4

  if (style === 'app') {
    // Rounded square background
    const q = Math.max(Math.abs(u), Math.abs(v))
    const corner = 0.36
    const dx = Math.max(Math.abs(u) - (0.9 - corner), 0),
      dy = Math.max(Math.abs(v) - (0.9 - corner), 0)
    const inBg = q <= 0.9 && Math.hypot(dx, dy) <= corner
    if (!inBg) return [0, 0, 0, 0]
    const ring = Math.abs(dist - 0.58) < 0.06
    return ring || hands(0.055) ? [255, 255, 255, 1] : [...ACCENT, 1]
  }
  if (style === 'template') {
    const ring = Math.abs(dist - 0.8) < 0.13
    return ring || hands(0.12) ? [0, 0, 0, 1] : [0, 0, 0, 0]
  }
  // tray
  if (dist > 0.95) return [0, 0, 0, 0]
  return hands(0.12) ? [255, 255, 255, 1] : [...ACCENT, 1]
}

// Minimal PNG encoder (RGBA, no filtering).
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

const outputs = [
  ['build/icon.png', 1024, 'app'],
  ['resources/trayTemplate.png', 16, 'template'],
  ['resources/trayTemplate@2x.png', 32, 'template'],
  ['resources/tray.png', 16, 'tray'],
  ['resources/tray@2x.png', 32, 'tray'],
]
for (const [file, size, style] of outputs) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, render(size, style))
  console.log('wrote', file)
}
