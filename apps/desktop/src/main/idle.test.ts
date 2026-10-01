// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { IdleWatcher, type IdleAway } from './idle'

const MIN = 60_000
let clock: number
let idleSeconds: number
let running: string | null
let threshold: number
let returns: IdleAway[]
let watcher: IdleWatcher

beforeEach(() => {
  clock = 1_000_000_000
  idleSeconds = 0
  running = 's1'
  threshold = 15 * MIN
  returns = []
  watcher = new IdleWatcher({
    systemIdleSeconds: () => idleSeconds,
    now: () => clock,
    thresholdMs: () => threshold,
    runningSessionId: () => running,
    onReturn: (a) => returns.push(a),
  })
})

/** Simulate time passing with no input. */
function awayFor(ms: number) {
  clock += ms
  idleSeconds += ms / 1000
  watcher.tick()
}

function comeBack(after = 1000) {
  clock += after
  idleSeconds = 0
  watcher.tick()
}

describe('input idle', () => {
  it('reports an absence longer than the threshold, from when input stopped', () => {
    const start = clock
    awayFor(10 * MIN)
    awayFor(10 * MIN)
    expect(returns).toEqual([])
    comeBack()
    expect(returns).toEqual([{ sessionId: 's1', idleStartedAt: start, returnedAt: clock }])
  })

  it('ignores short absences', () => {
    awayFor(14 * MIN)
    comeBack()
    expect(returns).toEqual([])
  })

  it('does nothing when no timer is running', () => {
    running = null
    awayFor(30 * MIN)
    comeBack()
    expect(returns).toEqual([])
  })

  it('does nothing when turned off (threshold 0)', () => {
    threshold = 0
    awayFor(60 * MIN)
    comeBack()
    expect(returns).toEqual([])
  })

  it('forgets the absence if the timer changed meanwhile', () => {
    awayFor(20 * MIN)
    running = 's2'
    comeBack()
    expect(returns).toEqual([])
  })
})

describe('sleep and lock', () => {
  it('counts from the moment of sleep, even if system idle resets on wake', () => {
    const sleptAt = clock
    watcher.suspend()
    clock += 2 * 60 * MIN // asleep for 2 hours
    idleSeconds = 0 // some systems reset idle time on wake
    watcher.tick() // ignored while suspended
    watcher.resume()
    expect(returns).toEqual([{ sessionId: 's1', idleStartedAt: sleptAt, returnedAt: clock }])
  })

  it('uses the earlier time if input was already idle before the lock', () => {
    const idleFrom = clock
    awayFor(16 * MIN) // already over the threshold
    watcher.suspend()
    clock += 30 * MIN
    watcher.resume()
    expect(returns[0]!.idleStartedAt).toBe(idleFrom)
  })

  it('ignores a short lock', () => {
    watcher.suspend()
    clock += 5 * MIN
    watcher.resume()
    expect(returns).toEqual([])
    awayFor(MIN)
    comeBack()
    expect(returns).toEqual([])
  })

  it('does nothing on wake if the timer was stopped while asleep', () => {
    watcher.suspend()
    clock += 60 * MIN
    running = null
    watcher.resume()
    expect(returns).toEqual([])
  })
})
