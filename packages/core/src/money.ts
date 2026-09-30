// SPDX-License-Identifier: GPL-3.0-or-later
// Money is stored as integer minor units ("cents"): 8550 = $85.50. Some currencies
// have no minor unit (JPY), so 8550 there means ¥8,550. Intl knows which is which.
import { StintError } from './errors'

export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits as number
}

export function isSupportedCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && Intl.supportedValuesOf('currency').includes(code)
}

/** 8550, "USD" → "$85.50" (in the user's locale when given). */
export function formatMoney(cents: number, currency: string, locale?: string): string {
  const digits = currencyDigits(currency)
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 10 ** digits)
}

/**
 * Parse what someone typed into a rate field into minor units.
 * "85", "85.5", "$1,250.00", "85,50" → cents. Empty → null. Anything else throws.
 */
export function parseMoney(text: string, currency: string): number | null {
  let s = text.replace(/[^\d.,-]/g, '')
  if (s === '') {
    if (text.trim() === '') return null
    throw invalid(text)
  }
  if (s.includes('.') && s.includes(','))
    s = s.replaceAll(',', '') // 1,250.00
  else if (/^\d+,\d{1,2}$/.test(s))
    s = s.replace(',', '.') // 85,50 (decimal comma)
  else s = s.replaceAll(',', '') // 1,250

  const match = /^(\d+)(?:\.(\d*))?$/.exec(s)
  if (!match) throw invalid(text)
  const digits = currencyDigits(currency)
  const fraction = match[2] ?? ''
  if (fraction.length > digits) throw invalid(text)
  return Number(match[1]) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0)
}

function invalid(text: string): StintError {
  return new StintError('invalid-amount', `"${text}" isn't a valid amount.`)
}
