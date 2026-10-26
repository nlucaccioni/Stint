// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { hexToRgb, hslToRgb, hsvToRgb, rgbToHex, rgbToHsl, rgbToHsv } from '../src/color'

describe('hex', () => {
  it('parses six- and three-digit hex, with or without #', () => {
    expect(hexToRgb('#3366cc')).toEqual({ r: 51, g: 102, b: 204 })
    expect(hexToRgb('3366CC')).toEqual({ r: 51, g: 102, b: 204 })
    expect(hexToRgb('#36c')).toEqual({ r: 51, g: 102, b: 204 })
  })

  it('rejects anything else', () => {
    expect(hexToRgb('blue')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
  })

  it('formats lowercase and clamps', () => {
    expect(rgbToHex({ r: 51, g: 102, b: 204 })).toBe('#3366cc')
    expect(rgbToHex({ r: 300, g: -4, b: 15.6 })).toBe('#ff0010')
  })
})

describe('HSV and HSL', () => {
  const samples = ['#000000', '#ffffff', '#ff0000', '#55e6f6', '#55f69d', '#3366cc', '#808080']

  it.each(samples)('round-trips %s through HSV', (hex) => {
    expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex)!)))).toBe(hex)
  })

  it.each(samples)('round-trips %s through HSL', (hex) => {
    expect(rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex)!)))).toBe(hex)
  })

  it('gives known values', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 })
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 })
    expect(hsvToRgb({ h: 120, s: 100, v: 50 })).toEqual({ r: 0, g: 128, b: 0 })
    expect(hslToRgb({ h: 60, s: 100, l: 50 })).toEqual({ r: 255, g: 255, b: 0 })
  })

  it('treats grey as hue 0 with no saturation', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128 })).toMatchObject({ h: 0, s: 0 })
  })
})
