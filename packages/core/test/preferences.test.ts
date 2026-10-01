// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { defaultPreferences, validatePreferences } from '../src/preferences'

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
