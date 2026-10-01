// SPDX-License-Identifier: GPL-3.0-or-later
// Long-running reminder (SPEC.md §6): notify once when a timer has run longer
// than the configured number of hours, in case it was forgotten.
import type { Session } from '@stint/core'

export interface NudgeWatcherDeps {
  now: () => number
  /** Threshold in ms; 0 = reminders off. */
  thresholdMs: () => number
  running: () => Session | null
  notify: (session: Session, elapsedMs: number) => void
}

export class NudgeWatcher {
  /** Sessions already reminded about (once each, per app run). */
  private notified = new Set<string>()

  constructor(private readonly deps: NudgeWatcherDeps) {}

  /** Call periodically (every minute is plenty). */
  tick(): void {
    const session = this.deps.running()
    const threshold = this.deps.thresholdMs()
    if (!session || threshold <= 0 || this.notified.has(session.id)) return
    const elapsed = this.deps.now() - session.startedAt
    if (elapsed >= threshold) {
      this.notified.add(session.id)
      this.deps.notify(session, elapsed)
    }
  }
}
