// SPDX-License-Identifier: GPL-3.0-or-later
// Global keyboard shortcuts: the actions, their per-platform defaults, and helpers
// for turning key presses into Electron "accelerator" strings and back into labels.
// Shared by main (registers them) and the renderer (records and displays them).

export const hotkeyActions = [
  'favorite1',
  'favorite2',
  'favorite3',
  'favorite4',
  'favorite5',
  'favorite6',
  'favorite7',
  'favorite8',
  'favorite9',
  'stop',
  'switcher',
] as const

export type HotkeyAction = (typeof hotkeyActions)[number]

/** Electron accelerator per action ("Control+Shift+Alt+1"), or null for none. */
export type HotkeyBindings = Record<HotkeyAction, string | null>

export type Platform = 'darwin' | 'win32' | 'linux'

export function hotkeyLabel(action: HotkeyAction): string {
  if (action === 'stop') return 'Stop timer'
  if (action === 'switcher') return 'Quick switcher'
  return `Favorite ${action.slice('favorite'.length)}`
}

/**
 * Defaults (SPEC.md §7). macOS: Cmd+Option. Windows/Linux: Ctrl+Shift+Alt, because
 * plain Ctrl+Alt is AltGr on many European layouts and would block typing.
 */
export function defaultHotkeys(platform: Platform): HotkeyBindings {
  const mod = platform === 'darwin' ? 'Command+Alt' : 'Control+Shift+Alt'
  const bindings = {} as HotkeyBindings
  for (let i = 1; i <= 9; i++) bindings[`favorite${i}` as HotkeyAction] = `${mod}+${i}`
  bindings.stop = `${mod}+0`
  bindings.switcher = `${mod}+K`
  return bindings
}

const MODIFIER_ORDER = ['Control', 'Command', 'Super', 'Shift', 'Alt'] as const
type Modifier = (typeof MODIFIER_ORDER)[number]

const MODIFIER_ALIASES: Record<string, Modifier> = {
  control: 'Control',
  ctrl: 'Control',
  command: 'Command',
  cmd: 'Command',
  super: 'Super',
  meta: 'Super',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
}

/** Same shortcut, same string: modifiers in a fixed order, key upper-cased. */
export function normalizeAccelerator(accelerator: string): string {
  const parts = accelerator.split('+').filter(Boolean)
  const key = parts.pop() ?? ''
  const mods = new Set(parts.map((p) => MODIFIER_ALIASES[p.toLowerCase()] ?? p))
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m))
  return [...ordered, key.length === 1 ? key.toUpperCase() : key].join('+')
}

/** Keys allowed as the non-modifier part, from KeyboardEvent.code. */
function keyFromCode(code: string): string | null {
  let m: RegExpExecArray | null
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1]!
  if ((m = /^Digit([0-9])$/.exec(code))) return m[1]!
  if ((m = /^Numpad([0-9])$/.exec(code))) return `num${m[1]}`
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
  }
  return named[code] ?? null
}

export interface KeyPress {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type RecordResult =
  | { kind: 'accelerator'; accelerator: string }
  /** Only modifiers held so far (keep listening). */
  | { kind: 'incomplete' }
  | { kind: 'invalid'; reason: string }

/**
 * Turn a key press into an accelerator. Uses the physical key (event.code), so
 * Shift+1 records as "1" rather than "!", and it works on any keyboard layout.
 */
export function acceleratorFromKeyPress(e: KeyPress, platform: Platform): RecordResult {
  const mods: Modifier[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.metaKey) mods.push(platform === 'darwin' ? 'Command' : 'Super')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  if (/^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/.test(e.code)) return { kind: 'incomplete' }
  const key = keyFromCode(e.code)
  if (!key) return { kind: 'invalid', reason: "That key can't be used in a shortcut." }
  const isFunctionKey = /^F\d+$/.test(key)
  if (mods.length === 0 && !isFunctionKey) {
    return { kind: 'invalid', reason: 'Add at least one modifier (Ctrl, Alt, Shift, or Cmd).' }
  }
  if (mods.length === 1 && mods[0] === 'Shift' && !isFunctionKey) {
    return { kind: 'invalid', reason: 'Shift alone would block typing. Add another modifier.' }
  }
  return { kind: 'accelerator', accelerator: normalizeAccelerator([...mods, key].join('+')) }
}

/** Human-readable label: "⌘⌥1" on macOS, "Ctrl+Shift+Alt+1" elsewhere. */
export function formatAccelerator(accelerator: string, platform: Platform): string {
  const parts = normalizeAccelerator(accelerator).split('+')
  const key = parts.pop()!
  if (platform === 'darwin') {
    const symbols: Record<string, string> = {
      Control: '⌃',
      Alt: '⌥',
      Shift: '⇧',
      Command: '⌘',
      Super: '⌘',
    }
    // macOS convention orders modifiers ⌃⌥⇧⌘.
    const order = ['Control', 'Alt', 'Shift', 'Command', 'Super']
    const mods = order.filter((m) => parts.includes(m)).map((m) => symbols[m])
    return mods.join('') + (key === 'Space' ? 'Space' : key)
  }
  const names: Record<string, string> = { Control: 'Ctrl', Super: 'Win' }
  return [...parts.map((m) => names[m] ?? m), key].join('+')
}
