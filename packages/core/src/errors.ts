// SPDX-License-Identifier: GPL-3.0-or-later

export type StintErrorCode =
  | 'end-before-start'
  | 'in-future'
  | 'session-locked'
  | 'session-deleted'
  | 'not-running'
  | 'session-running'
  | 'split-out-of-range'
  | 'stop-out-of-range'
  | 'invalid-name'
  | 'invalid-color'
  | 'invalid-rate'
  | 'invalid-currency'
  | 'invalid-amount'
  | 'not-found'

/** An action was rejected by a business rule. `code` is stable; `message` is for humans. */
export class StintError extends Error {
  constructor(
    readonly code: StintErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StintError'
  }
}
