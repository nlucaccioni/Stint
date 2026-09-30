// SPDX-License-Identifier: GPL-3.0-or-later
// Preload script: runs before the page loads, with access to a small part of
// Electron. It exposes one function per API method as `window.stintBridge`.
// Never expose ipcRenderer itself — that would let the page call any channel.
import { contextBridge, ipcRenderer } from 'electron'
import { apiMethods, channel, type BridgeApi } from '../shared/api'

const bridge = Object.fromEntries(
  apiMethods.map((method) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channel(method), ...args),
  ]),
) as BridgeApi

contextBridge.exposeInMainWorld('stintBridge', bridge)
