// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { currencyDigits, formatMoney, isSupportedCurrency, parseMoney } from '../src/money'

describe('parseMoney', () => {
  it.each([
    ['85', 8500],
    ['85.5', 8550],
    ['85.50', 8550],
    ['$85.50', 8550],
    [' 85 ', 8500],
    ['1,250', 125_000],
    ['1,250.00', 125_000],
    ['85,50', 8550],
    ['0', 0],
  ])('parses %j as %i cents (USD)', (text, cents) => {
    expect(parseMoney(text, 'USD')).toBe(cents)
  })

  it('returns null for an empty field', () => {
    expect(parseMoney('', 'USD')).toBeNull()
    expect(parseMoney('   ', 'USD')).toBeNull()
  })

  it.each(['abc', '-5', '1.2.3', '85.505', '$'])('rejects %j', (text) => {
    expect(() => parseMoney(text, 'USD')).toThrow(/valid amount/)
  })

  it('uses whole units for currencies without cents', () => {
    expect(parseMoney('8500', 'JPY')).toBe(8500)
    expect(() => parseMoney('85.5', 'JPY')).toThrow()
  })
})

describe('formatMoney', () => {
  it('formats minor units in the given locale', () => {
    expect(formatMoney(8550, 'USD', 'en-US')).toBe('$85.50')
    expect(formatMoney(8500, 'JPY', 'en-US')).toBe('¥8,500')
  })
})

describe('currencies', () => {
  it('knows fraction digits', () => {
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
  })

  it('accepts real ISO codes only', () => {
    expect(isSupportedCurrency('EUR')).toBe(true)
    expect(isSupportedCurrency('eur')).toBe(false)
    expect(isSupportedCurrency('ZZZ')).toBe(false)
  })
})
