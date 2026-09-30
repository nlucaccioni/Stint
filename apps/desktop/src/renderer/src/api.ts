// SPDX-License-Identifier: GPL-3.0-or-later
// The API as UI code uses it: each call returns its value or throws an ApiError.
import {
  apiMethods,
  type ApiMethod,
  type ApiResult,
  type EventName,
  type StintApi,
  type StintEvents,
  type Unsubscribe,
} from '../../shared/api'

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type UntypedBridge = Record<ApiMethod, (...args: unknown[]) => Promise<ApiResult<unknown>>>
const bridge = window.stintBridge as unknown as UntypedBridge

export const api = Object.fromEntries(
  apiMethods.map((method) => [
    method,
    async (...args: unknown[]) => {
      const result = await bridge[method](...args)
      if (!result.ok) throw new ApiError(result.error.code, result.error.message)
      return result.value
    },
  ]),
) as unknown as StintApi

/** Listen for an event pushed from the main process. Returns an unsubscribe function. */
export function onEvent<E extends EventName>(
  event: E,
  listener: (payload: StintEvents[E]) => void,
): Unsubscribe {
  return window.stintBridge.on(event, listener)
}
