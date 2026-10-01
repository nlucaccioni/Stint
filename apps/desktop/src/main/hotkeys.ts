// SPDX-License-Identifier: GPL-3.0-or-later
// Registers the global shortcuts and keeps track of which ones worked. Bindings are
// device-local (stored in device.json) because shortcuts differ per OS. Only the
// user's changes are stored; anything not overridden follows the defaults.
import {
  defaultHotkeys,
  hotkeyActions,
  normalizeAccelerator,
  type HotkeyAction,
  type HotkeyBindings,
  type Platform,
} from '../shared/hotkeys'
import type { HotkeyState, HotkeyStatus } from '../shared/api'

/** The part of Electron's globalShortcut this needs (a fake in tests). */
export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean
  unregisterAll(): void
}

export type HotkeyOverrides = Partial<Record<HotkeyAction, string | null>>

export interface HotkeyServiceDeps {
  registry: ShortcutRegistry
  platform: Platform
  /** Saved overrides from device settings. */
  overrides: HotkeyOverrides
  save: (overrides: HotkeyOverrides) => void
  onAction: (action: HotkeyAction) => void
}

export class HotkeyService {
  private overrides: HotkeyOverrides
  private paused = false
  private status = {} as Record<HotkeyAction, HotkeyStatus>

  constructor(private readonly deps: HotkeyServiceDeps) {
    this.overrides = { ...deps.overrides }
  }

  bindings(): HotkeyBindings {
    return { ...defaultHotkeys(this.deps.platform), ...this.overrides }
  }

  state(): HotkeyState {
    return {
      bindings: this.bindings(),
      defaults: defaultHotkeys(this.deps.platform),
      status: { ...this.status },
      paused: this.paused,
    }
  }

  /** (Re)register every shortcut and record which ones failed and why. */
  apply(): HotkeyState {
    const { registry } = this.deps
    registry.unregisterAll()
    const seen = new Map<string, HotkeyAction>()
    for (const action of hotkeyActions) {
      const accelerator = this.bindings()[action]
      if (!accelerator) {
        this.status[action] = { ok: true }
        continue
      }
      const key = normalizeAccelerator(accelerator)
      if (seen.has(key)) {
        this.status[action] = { ok: false, problem: 'duplicate' }
        continue
      }
      seen.set(key, action)
      if (this.paused) {
        this.status[action] = { ok: true }
        continue
      }
      try {
        const ok = registry.register(accelerator, () => this.deps.onAction(action))
        this.status[action] = ok ? { ok: true } : { ok: false, problem: 'in-use' }
      } catch {
        this.status[action] = { ok: false, problem: 'invalid' }
      }
    }
    return this.state()
  }

  /** Change one shortcut (null = no shortcut). */
  set(action: HotkeyAction, accelerator: string | null): HotkeyState {
    const value = accelerator === null ? null : normalizeAccelerator(accelerator)
    const fallback = defaultHotkeys(this.deps.platform)[action]
    if (value !== null && fallback !== null && value === normalizeAccelerator(fallback)) {
      delete this.overrides[action] // back to the default
    } else {
      this.overrides[action] = value
    }
    this.deps.save({ ...this.overrides })
    return this.apply()
  }

  reset(): HotkeyState {
    this.overrides = {}
    this.deps.save({})
    return this.apply()
  }

  /** Temporarily release all shortcuts, so the settings screen can record a new one. */
  setPaused(paused: boolean): HotkeyState {
    this.paused = paused
    return this.apply()
  }
}
