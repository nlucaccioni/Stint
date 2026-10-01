// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { fuzzyScore, fuzzySearch } from '../src/search'

const items = [
  { id: 'web', text: 'Website redesign · Acme Studio' },
  { id: 'brand', text: 'Branding · Acme Studio' },
  { id: 'cat', text: 'Catalog · Studio Berg' },
  { id: 'admin', text: 'Internal admin · Me' },
]
const ids = (q: string) => fuzzySearch(q, items).map((i) => i.id)

describe('fuzzyScore', () => {
  it('matches letters in order, case-insensitively', () => {
    expect(fuzzyScore('wbred', 'Website redesign')).not.toBeNull()
    expect(fuzzyScore('WEB', 'website')).not.toBeNull()
    expect(fuzzyScore('bew', 'website')).toBeNull()
  })

  it('treats an empty query as matching everything', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })

  it('ranks word starts and runs above scattered letters', () => {
    expect(fuzzyScore('cat', 'Catalog')!).toBeGreaterThan(fuzzyScore('cat', 'Ecological art')!)
  })
})

describe('fuzzySearch', () => {
  it('finds by project or client name, best first', () => {
    expect(ids('wbred')).toEqual(['web'])
    expect(ids('acme')).toEqual(['web', 'brand'])
    expect(ids('berg')[0]).toBe('cat') // 'Website redesign' also matches loosely, ranked lower
    expect(ids('br')[0]).toBe('brand')
  })

  it('keeps the original order when nothing is typed', () => {
    expect(ids('')).toEqual(['web', 'brand', 'cat', 'admin'])
  })

  it('ignores spaces in the query', () => {
    expect(ids('int adm')).toEqual(['admin'])
  })
})
