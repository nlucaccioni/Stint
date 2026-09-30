// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { sessionsToCsv } from '../src/csv'
import { at, batch, client, project, session } from './fixtures'

const now = at(2026, 3, 10, 18)
const base = {
  projects: [project()],
  clients: [client({ name: 'Acme, Inc.' })],
  batches: [batch({ id: 'b1', reference: 'INV-7', paidAt: 1 })],
  zone: 'America/New_York',
  now,
}

function lines(csv: string): string[] {
  return csv.trimEnd().split('\r\n')
}

describe('sessionsToCsv', () => {
  it('writes a header and one row per session in local time', () => {
    const csv = sessionsToCsv({
      ...base,
      sessions: [
        session({
          startedAt: at(2026, 3, 10, 13),
          endedAt: at(2026, 3, 10, 14, 30),
          note: 'Homepage',
        }),
      ],
    })
    expect(lines(csv)).toEqual([
      'Date,Start,End,Duration,Hours,Client,Project,Note,Billable,Status,Batch reference',
      '2026-03-10,09:00,10:30,1:30,1.50,"Acme, Inc.",Website,Homepage,yes,unbilled,',
    ])
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('sorts by start time and skips deleted sessions', () => {
    const csv = sessionsToCsv({
      ...base,
      sessions: [
        session({
          id: 'late',
          note: 'late',
          startedAt: at(2026, 3, 10, 15),
          endedAt: at(2026, 3, 10, 16),
        }),
        session({
          id: 'early',
          note: 'early',
          startedAt: at(2026, 3, 10, 13),
          endedAt: at(2026, 3, 10, 14),
        }),
        session({ id: 'gone', note: 'gone', deletedAt: 1 }),
      ],
    })
    const rows = lines(csv).slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain(',early,')
    expect(rows[1]).toContain(',late,')
  })

  it('leaves End blank for a running session and counts to now', () => {
    const row = lines(
      sessionsToCsv({
        ...base,
        sessions: [session({ startedAt: at(2026, 3, 10, 17), endedAt: null })],
      }),
    )[1]
    expect(row).toBe('2026-03-10,13:00,,1:00,1.00,"Acme, Inc.",Website,,yes,unbilled,')
  })

  it('includes billing status and batch reference', () => {
    const row = lines(
      sessionsToCsv({ ...base, sessions: [session({ billingBatchId: 'b1', billable: false })] }),
    )[1]
    expect(row!.endsWith(',no,paid,INV-7')).toBe(true)
  })

  it('quotes commas, quotes, and newlines', () => {
    const row = lines(
      sessionsToCsv({ ...base, sessions: [session({ note: 'said "hi", then\nleft' })] }),
    )
    expect(row.slice(1).join('\r\n')).toContain('"said ""hi"", then\nleft"')
  })

  it('neutralizes spreadsheet formulas in text', () => {
    const row = lines(
      sessionsToCsv({ ...base, sessions: [session({ note: '=HYPERLINK("x")' })] }),
    )[1]
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
    const minus = lines(sessionsToCsv({ ...base, sessions: [session({ note: '-2 hours' })] }))[1]
    expect(minus).toContain(",'-2 hours,")
  })
})
