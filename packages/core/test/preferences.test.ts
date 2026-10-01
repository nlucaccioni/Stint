// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  defaultPreferences,
  favoriteSlot,
  validatePreferences,
  withoutFavorites,
} from '../src/preferences'

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return (e as { code?: string }).code
  }
  return undefined
}

describe('preferences', () => {
  it('has the spec defaults', () => {
    expect(defaultPreferences).toEqual({
      idleMinutes: 15,
      nudgeHours: 4,
      weekStartsOn: 1,
      defaultCurrency: 'USD',
      favorites: [null, null, null, null, null, null, null, null, null],
      billingRoundingMinutes: 0,
      billingRoundingMode: 'up',
    })
  })

  it('passes through valid values, including 0 to turn a feature off', () => {
    expect(
      validatePreferences({
        idleMinutes: 0,
        nudgeHours: 8,
        weekStartsOn: 0,
        defaultCurrency: 'EUR',
      }),
    ).toEqual({
      idleMinutes: 0,
      nudgeHours: 8,
      weekStartsOn: 0,
      defaultCurrency: 'EUR',
    })
  })

  it.each([
    [{ idleMinutes: -1 }, 'invalid-preference'],
    [{ idleMinutes: 2.5 }, 'invalid-preference'],
    [{ nudgeHours: 25 }, 'invalid-preference'],
    [{ weekStartsOn: 7 as 0 }, 'invalid-preference'],
    [{ defaultCurrency: 'XYZ' }, 'invalid-currency'],
  ])('rejects %j', (edits, expected) => {
    expect(code(() => validatePreferences(edits))).toBe(expected)
  })
})

describe('favorites', () => {
  const slots = (...ids: (string | null)[]) => [...ids, ...Array(9 - ids.length).fill(null)]

  it('accepts nine slots', () => {
    expect(validatePreferences({ favorites: slots('a', null, 'b') }).favorites).toEqual(
      slots('a', null, 'b'),
    )
  })

  it('rejects the wrong number of slots or a project in two slots', () => {
    expect(code(() => validatePreferences({ favorites: ['a'] }))).toBe('invalid-preference')
    expect(code(() => validatePreferences({ favorites: slots('a', 'a') }))).toBe(
      'invalid-preference',
    )
  })

  it('finds a slot and clears removed projects', () => {
    expect(favoriteSlot(slots('a', 'b'), 'b')).toBe(2)
    expect(favoriteSlot(slots('a'), 'z')).toBeNull()
    expect(withoutFavorites(slots('a', 'b', 'c'), ['b'])).toEqual(slots('a', null, 'c'))
  })
})
