// SPDX-License-Identifier: GPL-3.0-or-later
// Connects each API handler to its IPC channel.
import { ipcMain } from 'electron'
import { apiMethods, channel } from '../shared/api'
import type { ApiHandlers } from './api'
import { toResult } from './result'

export function registerIpc(handlers: ApiHandlers): void {
  for (const method of apiMethods) {
    ipcMain.handle(channel(method), (_event, ...args: unknown[]) =>
      toResult(() => handlers[method](...args)),
    )
  }
}
