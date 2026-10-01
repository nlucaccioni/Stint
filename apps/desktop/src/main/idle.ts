// SPDX-License-Identifier: GPL-3.0-or-later
// Idle detection (SPEC.md §6). While a timer runs, notice when the user has been
// away longer than the threshold, and report it when they come back so they can
// keep, discard, or discard-and-continue that time.
//
// Two ways to be "away":
// - No keyboard/mouse input (system idle time, polled every few seconds).
// - The computer slept or the screen locked. System idle time can reset on wake,
//   so these events are tracked separately, starting from the moment they happen.

export interface IdleWatcherDeps {
  /** Seconds since the last keyboard/mouse input (Electron's powerMonitor). */
  systemIdleSeconds: () => number
  now: () => number
  /** Idle threshold in ms; 0 = idle detection off. */
  thresholdMs: () => number
  /** The running session's id, or null. */
  runningSessionId: () => string | null
  /** The user is back after being away at least the threshold. */
  onReturn: (away: IdleAway) => void
}

export interface IdleAway {
  sessionId: string
  /** When the user went away. */
  idleStartedAt: number
  /** When they came back. */
  returnedAt: number
}

export class IdleWatcher {
  /** When the current absence began, and which session was running then. */
  private away: { since: number; sessionId: string } | null = null
  /** True between sleep/lock and wake/unlock. */
  private suspended = false

  constructor(private readonly deps: IdleWatcherDeps) {}

  /** Call every few seconds. */
  tick(): void {
    if (this.suspended) return
    const sessionId = this.active()
    if (!sessionId) return

    const idleMs = this.deps.systemIdleSeconds() * 1000
    const now = this.deps.now()
    if (idleMs >= this.deps.thresholdMs()) {
      // Remember when the absence began (now minus how long input has been idle).
      this.away ??= { since: now - idleMs, sessionId }
    } else if (this.away) {
      this.finish(now)
    }
  }

  /** The computer is going to sleep or the screen locked. */
  suspend(): void {
    const sessionId = this.active()
    if (!sessionId) return
    this.suspended = true
    this.away ??= { since: this.deps.now(), sessionId }
  }

  /** The computer woke up or the screen unlocked. */
  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    const now = this.deps.now()
    if (this.away && now - this.away.since >= this.deps.thresholdMs() && this.active()) {
      this.finish(now)
    } else {
      this.away = null // too short to ask about
    }
  }

  /** The running session if idle detection applies, else null (and forget any absence). */
  private active(): string | null {
    const sessionId = this.deps.runningSessionId()
    if (!sessionId || this.deps.thresholdMs() <= 0) {
      this.away = null
      return null
    }
    // The timer changed while away (stopped and restarted): that absence no longer applies.
    if (this.away && this.away.sessionId !== sessionId) this.away = null
    return sessionId
  }

  private finish(now: number): void {
    const away = this.away!
    this.away = null
    this.deps.onReturn({ sessionId: away.sessionId, idleStartedAt: away.since, returnedAt: now })
  }
}
