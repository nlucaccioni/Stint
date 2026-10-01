// SPDX-License-Identifier: GPL-3.0-or-later
// User preferences that sync across devices (SPEC.md §5 "Synced preferences").
// Device-only settings (API token, window position) live elsewhere.
import { StintError } from './errors'
import { isSupportedCurrency } from './money'
import type { WeekStartDay } from './time'

export interface Preferences {
  /** Ask about idle time after this many minutes away. 0 = never ask. */
  idleMinutes: number
  /** Notify when a timer has run this many hours. 0 = never. */
  nudgeHours: number
  /** 0 = Sunday, 1 = Monday, … */
  weekStartsOn: WeekStartDay
  /** Currency for new clients. */
  defaultCurrency: string
  /**
   * Nine favorite slots (index 0 = slot 1), each a project id or null. Shared by
   * hotkeys, the tray menu, and the Keypad.
   */
  favorites: (string | null)[]
}

export const FAVORITE_SLOTS = 9

export const defaultPreferences: Preferences = {
  idleMinutes: 15,
  nudgeHours: 4,
  weekStartsOn: 1,
  defaultCurrency: 'USD',
  favorites: Array.from({ length: 9 }, () => null),
}

export const preferenceKeys = Object.keys(defaultPreferences) as (keyof Preferences)[]

/** Check each given preference; returns the valid values or throws a StintError. */
export function validatePreferences(edits: Partial<Preferences>): Partial<Preferences> {
  const out: Partial<Preferences> = {}
  if (edits.idleMinutes !== undefined) {
    out.idleMinutes = wholeNumber(edits.idleMinutes, 0, 480, 'Idle time must be 0–480 minutes.')
  }
  if (edits.nudgeHours !== undefined) {
    out.nudgeHours = wholeNumber(edits.nudgeHours, 0, 24, 'Reminder must be 0–24 hours.')
  }
  if (edits.weekStartsOn !== undefined) {
    out.weekStartsOn = wholeNumber(
      edits.weekStartsOn,
      0,
      6,
      'Invalid week start day.',
    ) as WeekStartDay
  }
  if (edits.defaultCurrency !== undefined) {
    if (!isSupportedCurrency(edits.defaultCurrency)) {
      throw new StintError(
        'invalid-currency',
        `${edits.defaultCurrency} isn't a supported currency code.`,
      )
    }
    out.defaultCurrency = edits.defaultCurrency
  }
  if (edits.favorites !== undefined) {
    const favs = edits.favorites
    if (!Array.isArray(favs) || favs.length !== FAVORITE_SLOTS) {
      throw new StintError('invalid-preference', `Favorites must have ${FAVORITE_SLOTS} slots.`)
    }
    const used = favs.filter((id): id is string => id !== null)
    if (new Set(used).size !== used.length) {
      throw new StintError('invalid-preference', 'A project can only be in one favorite slot.')
    }
    out.favorites = [...favs]
  }
  return out
}

/** The 1-based favorite slot a project is in, or null. */
export function favoriteSlot(
  favorites: readonly (string | null)[],
  projectId: string,
): number | null {
  const i = favorites.indexOf(projectId)
  return i === -1 ? null : i + 1
}

/** Favorites with the given projects removed (e.g. after they're deleted). */
export function withoutFavorites(
  favorites: readonly (string | null)[],
  projectIds: readonly string[],
): (string | null)[] {
  return favorites.map((id) => (id !== null && projectIds.includes(id) ? null : id))
}

function wholeNumber(value: number, min: number, max: number, message: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new StintError('invalid-preference', message)
  }
  return value
}
