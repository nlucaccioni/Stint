// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

// updates.ts imports Electron and electron-updater at the top; neither is needed
// to test the version comparison, so stand them in.
vi.mock('electron', () => ({ app: {}, dialog: {}, net: {}, shell: {} }))
vi.mock('electron-updater', () => ({ default: {} }))

const { isNewerVersion } = await import('./updates')

describe('isNewerVersion', () => {
  it.each([
    ['0.2.0', '0.1.0', true],
    ['0.1.10', '0.1.9', true],
    ['1.0.0', '0.99.99', true],
    ['v0.2.0', '0.1.0', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['0.1', '0.1.0', false],
    ['0.2.0-beta.1', '0.1.0', true],
  ])('%s newer than %s → %s', (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected)
  })
})
