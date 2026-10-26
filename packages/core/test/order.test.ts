// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { compareOrder, keyAtEnd, keyBetween, keyForMove, type Ordered } from '../src/order'

describe('keyBetween', () => {
  it('starts in the middle and leaves room on both sides', () => {
    const k = keyBetween(null, null)
    expect(keyBetween(null, k) < k).toBe(true)
    expect(keyBetween(k, null) > k).toBe(true)
  })

  it('always finds a key strictly between two keys', () => {
    const cases: [string | null, string | null][] = [
      ['a', 'b'],
      ['a', 'a1'],
      ['a0001', 'a0002'],
      ['az', 'b'],
      [null, '1'],
      ['zzz', null],
      ['a000010', 'a000011'],
    ]
    for (const [a, b] of cases) {
      const k = keyBetween(a, b)
      if (a !== null) expect(k > a).toBe(true)
      if (b !== null) expect(k < b).toBe(true)
    }
  })

  it('keeps finding room after many insertions in the same gap', () => {
    let lo = 'a'
    const hi = 'b'
    for (let i = 0; i < 200; i++) {
      const k = keyBetween(lo, hi)
      expect(k > lo && k < hi).toBe(true)
      lo = k
    }
    let up = 'a'
    for (let i = 0; i < 200; i++) {
      const k = keyBetween(null, up)
      expect(k < up).toBe(true)
      up = k
    }
  })

  it('rejects neighbours in the wrong order', () => {
    expect(() => keyBetween('b', 'a')).toThrow()
    expect(() => keyBetween('a', 'a')).toThrow()
  })
})

describe('ordering lists', () => {
  const list: Ordered[] = [
    { id: 'c', sortKey: 'a000003' },
    { id: 'a', sortKey: 'a000001' },
    { id: 'b', sortKey: 'a000002' },
  ]
  const ids = (items: Ordered[]) => [...items].sort(compareOrder).map((i) => i.id)

  it('sorts by key, then id for equal keys', () => {
    expect(ids(list)).toEqual(['a', 'b', 'c'])
    expect(
      ids([
        { id: 'y', sortKey: 'k' },
        { id: 'x', sortKey: 'k' },
      ]),
    ).toEqual(['x', 'y'])
  })

  it('appends after the last item', () => {
    expect(ids([...list, { id: 'new', sortKey: keyAtEnd(list) }])).toEqual(['a', 'b', 'c', 'new'])
    expect(keyAtEnd([])).toBeTruthy()
  })

  function moved(id: string, beforeId: string | null) {
    const key = keyForMove(list, id, beforeId)
    return ids(list.map((i) => (i.id === id ? { ...i, sortKey: key } : i)))
  }

  it('moves an item before another', () => {
    expect(moved('c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moved('a', 'c')).toEqual(['b', 'a', 'c'])
  })

  it('moves an item to the end', () => {
    expect(moved('a', null)).toEqual(['b', 'c', 'a'])
  })

  it('still moves past items that share a key after a sync', () => {
    const tied: Ordered[] = [
      { id: 'a', sortKey: 'm' },
      { id: 'b', sortKey: 'm' },
      { id: 'c', sortKey: 'z' },
    ]
    const key = keyForMove(tied, 'c', 'b')
    expect(key > 'm').toBe(true)
  })
})
