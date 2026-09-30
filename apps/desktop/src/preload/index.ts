// SPDX-License-Identifier: GPL-3.0-or-later
// Preload script: runs before the page loads, with access to a small part of
// Electron. It exposes one function per API method, plus `on` for the listed
// events, as `window.stintBridge`.
// Never expose ipcRenderer itself — that would let the page call any channel.
import { contextBridge, ipcRenderer } from 'electron'
import {
  apiMethods,
  channel,
  eventChannel,
  eventNames,
  type BridgeApi,
  type EventName,
} from '../shared/api'

const methods = Object.fromEntries(
  apiMethods.map((method) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channel(method), ...args),
  ]),
)

function on(event: EventName, listener: (payload: unknown) => void) {
  if (!eventNames.includes(event)) throw new Error(`Unknown event: ${event}`)
  const handler = (_e: unknown, payload: unknown) => listener(payload)
  ipcRenderer.on(eventChannel(event), handler)
  return () => {
    ipcRenderer.removeListener(eventChannel(event), handler)
  }
}

contextBridge.exposeInMainWorld('stintBridge', { ...methods, on } as BridgeApi)
