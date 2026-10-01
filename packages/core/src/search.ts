// SPDX-License-Identifier: GPL-3.0-or-later
// Fuzzy matching for the quick switcher: the query's letters must appear in order
// (not necessarily together), so "wbred" finds "Website redesign". Matches that
// start words or run together score higher.

/** Score how well `query` matches `text` (higher is better), or null for no match. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (q === '') return 0
  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let previous = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    const wordStart = found === 0 || /[\s\-_·./]/.test(t[found - 1]!)
    score += 1
    if (found === previous + 1) score += 3 // consecutive letters
    if (wordStart) score += 4 // start of a word
    score -= Math.min(found - ti, 5) * 0.1 // small penalty for gaps
    previous = found
    ti = found + 1
  }
  // Prefer shorter texts when scores tie (a closer match).
  return score - t.length * 0.01
}

export interface SearchItem {
  id: string
  /** Text that's matched, e.g. "Website redesign Acme Studio". */
  text: string
}

/** Items matching `query`, best first. Ties keep the input order. */
export function fuzzySearch<T extends SearchItem>(query: string, items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, item.text) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item)
}
