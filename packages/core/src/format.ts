// SPDX-License-Identifier: GPL-3.0-or-later

/** Durations everywhere in the app, to the second: "0:05:09", "12:00:00". */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h}:${pad(m)}:${pad(s)}`
}

/** Totals style: "1:05" (hours:minutes). */
export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000)
  return `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}`
}

/** Decimal hours for spreadsheets and invoices: 5_400_000 ms → "1.50". */
export function formatDecimalHours(ms: number): string {
  return (Math.max(0, ms) / 3_600_000).toFixed(2)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
