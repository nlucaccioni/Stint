// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '@stint/core'
import { NudgeWatcher } from './nudge'

const HOUR = 3_600_000
let clock: number
let threshold: number
let running: Session | null
let notified: [string, number][]
let watcher: NudgeWatcher

const session = (id: string, startedAt: number) => ({ id, startedAt }) as Session

beforeEach(() => {
  clock = 10 * HOUR
  threshold = 4 * HOUR
  running = session('s1', clock)
  notified = []
  watcher = new NudgeWatcher({
    now: () => clock,
    thresholdMs: () => threshold,
    running: () => running,
    notify: (s, elapsed) => notified.push([s.id, elapsed]),
  })
})

describe('NudgeWatcher', () => {
  it('notifies once the timer passes the threshold, and only once', () => {
    clock += 3 * HOUR
    watcher.tick()
    expect(notified).toEqual([])
    clock += HOUR
    watcher.tick()
    clock += HOUR
    watcher.tick()
    expect(notified).toEqual([['s1', 4 * HOUR]])
  })

  it('notifies again for a new session', () => {
    clock += 5 * HOUR
    watcher.tick()
    running = session('s2', clock - 5 * HOUR)
    watcher.tick()
    expect(notified.map(([id]) => id)).toEqual(['s1', 's2'])
  })

  it('stays quiet when off or idle', () => {
    clock += 10 * HOUR
    threshold = 0
    watcher.tick()
    threshold = 4 * HOUR
    running = null
    watcher.tick()
    expect(notified).toEqual([])
  })
})
