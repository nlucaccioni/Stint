// SPDX-License-Identifier: GPL-3.0-or-later
import { ZodError } from 'zod'
import { StintError } from '@stint/core'
import type { ApiResult } from '../shared/api'

/** Run a handler and package its outcome for the trip back to the renderer. */
export function toResult<T>(fn: () => T): ApiResult<T> {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return toError(error)
  }
}

/** Same as toResult, for handlers that return a promise (e.g. ones that open a dialog). */
export async function toResultAsync<T>(fn: () => T | Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return toError(error)
  }
}

function toError(error: unknown): { ok: false; error: { code: string; message: string } } {
  if (error instanceof StintError) {
    return { ok: false, error: { code: error.code, message: error.message } }
  }
  if (error instanceof ZodError) {
    // The UI sent something malformed: a bug in our code, not a user mistake.
    console.error('[ipc] invalid input', error.issues)
    return { ok: false, error: { code: 'invalid-input', message: 'Invalid request.' } }
  }
  console.error('[ipc] unexpected error', error)
  return { ok: false, error: { code: 'internal', message: 'Something went wrong.' } }
}
