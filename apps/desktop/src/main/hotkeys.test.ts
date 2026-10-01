// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import type { HotkeyAction } from '../shared/hotkeys'
import { HotkeyService, type HotkeyOverrides, type ShortcutRegistry } from './hotkeys'

/** A fake globalShortcut: some accelerators are "owned by another app". */
class FakeRegistry implements ShortcutRegistry {
  taken = new Set<string>()
  registered = new Map<string, () => void>()
  register(accelerator: string, callback: () => void): boolean {
    if (accelerator.includes('Bogus')) throw new Error('invalid accelerator')
    if (this.taken.has(accelerator)) return false
    this.registered.set(accelerator, callback)
    return true
  }
  unregisterAll(): void {
    this.registered.clear()
  }
}

let registry: FakeRegistry
let saved: HotkeyOverrides | null
let fired: HotkeyAction[]

function service(overrides: HotkeyOverrides = {}) {
  return new HotkeyService({
    registry,
    platform: 'win32',
    overrides,
    save: (o) => (saved = o),
    onAction: (a) => fired.push(a),
  })
}

beforeEach(() => {
  registry = new FakeRegistry()
  saved = null
  fired = []
})

describe('HotkeyService', () => {
  it('registers the defaults and runs the action on press', () => {
    const s = service()
    const state = s.apply()
    expect(Object.values(state.status).every((st) => st.ok)).toBe(true)
    expect(registry.registered.size).toBe(11)
    registry.registered.get('Control+Shift+Alt+3')!()
    expect(fired).toEqual(['favorite3'])
  })

  it('reports shortcuts another app owns', () => {
    registry.taken.add('Control+Shift+Alt+K')
    expect(service().apply().status.switcher).toEqual({ ok: false, problem: 'in-use' })
  })

  it('reports two actions with the same shortcut', () => {
    const state = service({ stop: 'Alt+Shift+Ctrl+1' }).apply()
    expect(state.status.favorite1).toEqual({ ok: true })
    expect(state.status.stop).toEqual({ ok: false, problem: 'duplicate' })
  })

  it('reports shortcuts Electron rejects', () => {
    expect(service({ stop: 'Control+Bogus' }).apply().status.stop).toEqual({
      ok: false,
      problem: 'invalid',
    })
  })

  it('saves only changes from the defaults', () => {
    const s = service()
    s.set('stop', 'Control+Alt+F12')
    expect(saved).toEqual({ stop: 'Control+Alt+F12' })
    s.set('switcher', null)
    expect(saved).toEqual({ stop: 'Control+Alt+F12', switcher: null })
    expect(registry.registered.has('Control+Shift+Alt+K')).toBe(false)
    // Setting a shortcut back to its default removes the override.
    s.set('stop', 'Alt+Shift+Control+0')
    expect(saved).toEqual({ switcher: null })
  })

  it('resets to defaults', () => {
    const s = service({ stop: null })
    expect(s.reset().bindings.stop).toBe('Control+Shift+Alt+0')
    expect(saved).toEqual({})
  })

  it('releases everything while paused (for recording) and restores after', () => {
    const s = service()
    s.apply()
    s.setPaused(true)
    expect(registry.registered.size).toBe(0)
    s.setPaused(false)
    expect(registry.registered.size).toBe(11)
  })
})
