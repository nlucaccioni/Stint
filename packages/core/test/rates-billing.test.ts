// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { billingStatus, isLocked } from '../src/billing'
import { amountCents, effectiveRate } from '../src/rates'
import { HOUR, MIN, batch, client, project } from './fixtures'

describe('effectiveRate', () => {
  it('uses the project rate when set', () => {
    expect(effectiveRate(project({ hourlyRateCents: 15_000 }), client())).toEqual({
      currency: 'USD',
      cents: 15_000,
    })
  })

  it('falls back to the client rate', () => {
    expect(effectiveRate(project(), client({ hourlyRateCents: 8_000 }))?.cents).toBe(8_000)
  })

  it('takes currency from the client', () => {
    expect(
      effectiveRate(project({ hourlyRateCents: 1 }), client({ currency: 'EUR' }))?.currency,
    ).toBe('EUR')
  })

  it('is null when neither has a rate', () => {
    expect(effectiveRate(project(), client({ hourlyRateCents: null }))).toBeNull()
  })

  it('respects a project rate of 0 (free work) over the client rate', () => {
    expect(effectiveRate(project({ hourlyRateCents: 0 }), client())?.cents).toBe(0)
  })
})

describe('amountCents', () => {
  it('multiplies hours by rate', () => {
    expect(amountCents(90 * MIN, 10_000)).toBe(15_000)
  })

  it('rounds to the nearest cent', () => {
    // 1 minute at $100/h = 166.67 cents
    expect(amountCents(MIN, 10_000)).toBe(167)
    expect(amountCents(HOUR, 0)).toBe(0)
  })
})

describe('billingStatus', () => {
  const batches = new Map([
    ['billed', batch({ id: 'billed' })],
    ['paid', batch({ id: 'paid', paidAt: 1 })],
  ])

  it('derives status from the batch', () => {
    expect(billingStatus({ billingBatchId: null }, batches)).toBe('unbilled')
    expect(billingStatus({ billingBatchId: 'billed' }, batches)).toBe('billed')
    expect(billingStatus({ billingBatchId: 'paid' }, batches)).toBe('paid')
  })

  it('treats a missing batch as billed so the session stays locked', () => {
    expect(billingStatus({ billingBatchId: 'gone' }, batches)).toBe('billed')
  })

  it('locks sessions in any batch', () => {
    expect(isLocked({ billingBatchId: null })).toBe(false)
    expect(isLocked({ billingBatchId: 'billed' })).toBe(true)
  })
})
