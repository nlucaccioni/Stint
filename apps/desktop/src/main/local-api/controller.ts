// SPDX-License-Identifier: GPL-3.0-or-later
// Ties the Local API's settings file to its server: starts, stops, or moves the
// server when the user changes the settings, and reports how it's doing for the
// Settings screen. No Electron here either, so it can be tested directly.
import { StintError } from '@stint/core'
import type { LocalApiStatus } from '../../shared/api'
import {
  isValidPort,
  loadLocalApiConfig,
  newToken,
  saveLocalApiConfig,
  type LocalApiConfig,
} from './config'
import { CloseCode } from './protocol'
import { LocalApiServer, type LocalApiDeps } from './server'

export interface LocalApiControllerOptions {
  /** The app data folder, where local-api.json lives. */
  dir: string
  defaultPort: number
  deps: Omit<LocalApiDeps, 'onClientsChanged'>
  onStatusChanged?: (status: LocalApiStatus) => void
}

export class LocalApiController {
  private config: LocalApiConfig
  private readonly server: LocalApiServer
  private listening = false
  private problem: LocalApiStatus['problem'] = null

  constructor(private readonly options: LocalApiControllerOptions) {
    this.config = loadLocalApiConfig(options.dir, options.defaultPort)
    this.server = new LocalApiServer({
      ...options.deps,
      onClientsChanged: () => this.changed(),
    })
  }

  status(): LocalApiStatus {
    return {
      enabled: this.config.enabled,
      port: this.config.port,
      listening: this.listening,
      problem: this.problem,
      clients: this.server.clientNames,
    }
  }

  /** Start or stop the server to match the settings. Never throws: problems show in status(). */
  async apply(): Promise<LocalApiStatus> {
    await this.server.stop(CloseCode.tokenChanged, 'The Local API settings changed.')
    this.listening = false
    this.problem = null
    if (this.config.enabled) {
      try {
        await this.server.start(this.config.port, this.config.token)
        this.listening = true
      } catch (error) {
        const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
        this.problem = inUse ? 'in-use' : 'failed'
        if (!inUse) console.error('[local-api] could not start', error)
      }
    }
    this.changed()
    return this.status()
  }

  async update(edits: { enabled?: boolean; port?: number }): Promise<LocalApiStatus> {
    if (edits.port !== undefined && !isValidPort(edits.port)) {
      throw new StintError('invalid-preference', 'The port must be a number from 1024 to 65535.')
    }
    this.config = { ...this.config, ...edits }
    saveLocalApiConfig(this.options.dir, this.config)
    return this.apply()
  }

  /** Make a new token. Connected clients are dropped and reconnect with the new one. */
  regenerateToken(): LocalApiStatus {
    this.config = { ...this.config, token: newToken() }
    saveLocalApiConfig(this.options.dir, this.config)
    this.server.setToken(this.config.token)
    return this.status()
  }

  notifyState(): void {
    this.server.notifyState()
  }

  notifyProjects(): void {
    this.server.notifyProjects()
  }

  async stop(): Promise<void> {
    await this.server.stop()
    this.listening = false
  }

  private changed(): void {
    this.options.onStatusChanged?.(this.status())
  }
}
