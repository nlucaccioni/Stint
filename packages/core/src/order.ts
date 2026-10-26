// SPDX-License-Identifier: GPL-3.0-or-later
// User-defined order for clients and projects (SPEC.md §5 "Ordering").
//
// Each record has a `sortKey`: a short string, and lists sort by it (ties broken
// by id). Moving an item gives it a new key between its new neighbours' keys, so
// one move changes one record. That keeps reordering sync-friendly: two devices
// moving different items never touch the same rows.
//
// Keys are base-36 "fractions": "i" sits halfway between "" and "z", "i8" just
// after "i". There is always room for another key between two keys.

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

/**
 * A key that sorts strictly between `before` and `after` (either may be null for
 * "no neighbour on that side"). Throws if before >= after.
 */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`keyBetween: "${before}" is not before "${after}"`)
  }
  return midpoint(before ?? '', after)
}

/** Digit-by-digit midpoint of two keys; `b` null means "past the end". */
function midpoint(a: string, b: string | null): string {
  // Skip the shared prefix (a is padded with zeros as needed).
  if (b !== null) {
    let n = 0
    while ((a[n] ?? '0') === b[n]) n++
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
  }
  const digitA = a ? DIGITS.indexOf(a[0]!) : 0
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : BASE
  if (digitB - digitA > 1) {
    // Room for a digit in between.
    return DIGITS[Math.round((digitA + digitB) / 2)]!
  }
  // Adjacent digits: b's first digit alone works if b has more digits after it…
  if (b !== null && b.length > 1) return b[0]!
  // …otherwise keep a's digit and go one place deeper.
  return DIGITS[digitA]! + midpoint(a.slice(1), null)
}

export interface Ordered {
  id: string
  sortKey: string
}

/** Sorts by sortKey, then id, so every device shows the same order. */
export function compareOrder(a: Ordered, b: Ordered): number {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** A key that puts a new item after everything in `items`. */
export function keyAtEnd(items: readonly Ordered[]): string {
  const last = [...items].sort(compareOrder).at(-1)
  return keyBetween(last?.sortKey ?? null, null)
}

/**
 * The new key for `id` when it's moved to sit just before `beforeId` (or at the
 * end when beforeId is null). `items` is the whole list it's ordered within,
 * including `id` itself and any hidden (archived) items.
 */
export function keyForMove(items: readonly Ordered[], id: string, beforeId: string | null): string {
  const others = items.filter((i) => i.id !== id).sort(compareOrder)
  const at = beforeId === null ? others.length : others.findIndex((i) => i.id === beforeId)
  if (at === -1) throw new Error(`keyForMove: no item ${beforeId}`)
  const prev = others[at - 1]?.sortKey ?? null
  const next = others[at]?.sortKey ?? null
  // Sync can leave two items with the same key; nudge past it so the move lands.
  if (prev !== null && next !== null && prev >= next) return keyBetween(prev, null)
  return keyBetween(prev, next)
}

/**
 * `rows` (e.g. totals per client) put in the order of `ordered` (clients or
 * projects as listed, already in the user's order). Rows for unknown ids go last.
 */
export function inListOrder<T>(
  rows: readonly T[],
  ordered: readonly { id: string }[],
  idOf: (row: T) => string,
): T[] {
  const rank = new Map(ordered.map((item, i) => [item.id, i]))
  const at = (row: T) => rank.get(idOf(row)) ?? ordered.length
  return [...rows].sort((a, b) => at(a) - at(b))
}
