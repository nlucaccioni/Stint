// SPDX-License-Identifier: GPL-3.0-or-later
// Preload script: runs before the page loads, with access to a small part of
// Electron. It exposes exactly the functions in StintApi as `window.stint`.
// Never expose ipcRenderer itself — that would let the page call any channel.
import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type StintApi } from '../shared/api'

const api: StintApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.getAppInfo),
}

contextBridge.exposeInMainWorld('stint', api)
