// SPDX-License-Identifier: GPL-3.0-or-later
// Color conversions for the client color picker. Colors are stored as "#rrggbb";
// the picker works in HSV (its square is saturation × value) and shows RGB, HSL or
// hex. All channels are integers: RGB 0–255, hue 0–359, the rest 0–100.

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Hue 0–360, saturation and value 0–100 (fractional while dragging). */
export interface Hsv {
  h: number
  s: number
  v: number
}

/** Hue 0–360, saturation and lightness 0–100. */
export interface Hsl {
  h: number
  s: number
  l: number
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** "#3366cc", "3366CC" or "#36c" → RGB; null if it isn't a hex color. */
export function hexToRgb(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const d = max - Math.min(rn, gn, bn)
  return { h: hueOf(rn, gn, bn, max, d), s: max === 0 ? 0 : (d / max) * 100, v: max * 100 }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const sn = clamp(s, 0, 100) / 100
  const vn = clamp(v, 0, 100) / 100
  const f = (n: number) => {
    const k = (n + (((h % 360) + 360) % 360) / 60) % 6
    return Math.round((vn - vn * sn * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
  }
  return { r: f(5), g: f(3), b: f(1) }
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h: hueOf(rn, gn, bn, max, d), s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + (((h % 360) + 360) % 360) / 30) % 12
    return Math.round((ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return { r: f(0), g: f(8), b: f(4) }
}

/** Shared hue formula for HSV and HSL; 0 for greys. */
function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/**
 * The same hue and saturation at full brightness (HSV value 100). Client colors
 * are kept this bright so their glows always show; a dark color would barely glow.
 * Greys come out white. Returns the input unchanged if it isn't a hex color.
 */
export function atFullBrightness(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(hsvToRgb({ ...rgbToHsv(rgb), v: 100 }))
}
