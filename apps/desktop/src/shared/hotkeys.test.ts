// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  acceleratorFromKeyPress,
  defaultHotkeys,
  formatAccelerator,
  normalizeAccelerator,
  type KeyPress,
} from './hotkeys'

const press = (code: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('defaultHotkeys', () => {
  it('uses Cmd+Option on macOS and Ctrl+Shift+Alt elsewhere', () => {
    const mac = defaultHotkeys('darwin')
    const win = defaultHotkeys('win32')
    expect([mac.favorite1, mac.stop, mac.switcher]).toEqual([
      'Command+Alt+1',
      'Command+Alt+0',
      'Command+Alt+K',
    ])
    expect([win.favorite9, win.stop, win.switcher]).toEqual([
      'Control+Shift+Alt+9',
      'Control+Shift+Alt+0',
      'Control+Shift+Alt+K',
    ])
  })
})

describe('normalizeAccelerator', () => {
  it('orders modifiers and accepts aliases, so equal shortcuts compare equal', () => {
    expect(normalizeAccelerator('Shift+Alt+Control+k')).toBe('Control+Shift+Alt+K')
    expect(normalizeAccelerator('Ctrl+Option+Shift+K')).toBe('Control+Shift+Alt+K')
    expect(normalizeAccelerator('Control+Shift+Alt+1')).toBe(
      normalizeAccelerator('Alt+Shift+Ctrl+1'),
    )
  })
})

describe('acceleratorFromKeyPress', () => {
  it('records the physical key, not the shifted character', () => {
    expect(
      acceleratorFromKeyPress(
        press('Digit1', { ctrlKey: true, shiftKey: true, altKey: true }),
        'win32',
      ),
    ).toEqual({ kind: 'accelerator', accelerator: 'Control+Shift+Alt+1' })
  })

  it('maps Meta to Command on macOS and Super elsewhere', () => {
    expect(
      acceleratorFromKeyPress(press('KeyK', { metaKey: true, altKey: true }), 'darwin'),
    ).toEqual({
      kind: 'accelerator',
      accelerator: 'Command+Alt+K',
    })
    expect(acceleratorFromKeyPress(press('KeyK', { metaKey: true }), 'win32')).toEqual({
      kind: 'accelerator',
      accelerator: 'Super+K',
    })
  })

  it('waits while only modifiers are held', () => {
    expect(acceleratorFromKeyPress(press('ShiftLeft', { shiftKey: true }), 'win32').kind).toBe(
      'incomplete',
    )
  })

  it('requires a modifier except for function keys', () => {
    expect(acceleratorFromKeyPress(press('KeyA'), 'win32').kind).toBe('invalid')
    expect(acceleratorFromKeyPress(press('KeyA', { shiftKey: true }), 'win32').kind).toBe('invalid')
    expect(acceleratorFromKeyPress(press('F9'), 'win32')).toEqual({
      kind: 'accelerator',
      accelerator: 'F9',
    })
  })

  it('rejects keys Electron cannot bind', () => {
    expect(acceleratorFromKeyPress(press('IntlBackslash', { ctrlKey: true }), 'win32').kind).toBe(
      'invalid',
    )
  })
})

describe('formatAccelerator', () => {
  it('uses symbols on macOS', () => {
    expect(formatAccelerator('Command+Alt+1', 'darwin')).toBe('⌥⌘1')
    expect(formatAccelerator('Control+Shift+Alt+K', 'darwin')).toBe('⌃⌥⇧K')
  })

  it('uses names on Windows', () => {
    expect(formatAccelerator('Control+Shift+Alt+1', 'win32')).toBe('Ctrl+Shift+Alt+1')
    expect(formatAccelerator('Super+K', 'win32')).toBe('Win+K')
  })
})
