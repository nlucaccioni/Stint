// SPDX-License-Identifier: GPL-3.0-or-later
// The contract between the renderer (React UI) and the main process.
// The preload script implements StintApi and exposes it as `window.stint`;
// the main process registers a handler for each channel. Keep this list small
// and explicit: the renderer can do nothing that isn't listed here.

export interface AppInfo {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
}

export interface StintApi {
  getAppInfo(): Promise<AppInfo>
}

export const IpcChannel = {
  getAppInfo: 'app:getInfo',
} as const
