// SPDX-License-Identifier: GPL-3.0-or-later
// A swatch that opens a color picker (Figma: Color Picker): a saturation/brightness
// square, a hue slider, an eyedropper, and the value as HSL, RGB or hex.
//
// The panel is a native popover anchored to the swatch, like Menu and Select. The
// picker works in HSV internally so the hue survives dragging through greys.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { hexToRgb, hslToRgb, hsvToRgb, rgbToHex, rgbToHsl, rgbToHsv, type Hsv } from '@stint/core'
import { Pipette } from 'lucide-react'
import { Select } from './Select'
import styles from './ColorPicker.module.css'

type Mode = 'hsl' | 'rgb' | 'hex'
const MODES = [
  { value: 'rgb', label: 'RGB' },
  { value: 'hex', label: 'Hex' },
  { value: 'hsl', label: 'HSL' },
] as const

/** Chromium's EyeDropper API (not yet in TypeScript's DOM types). */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperApi
  }
}

export interface ColorPickerProps {
  /** "#rrggbb" */
  value: string
  onChange: (hex: string) => void
  /** Set by Field: the label's target, plus its hint wiring. */
  id?: string
  className?: string
  'aria-describedby'?: string
  'aria-label'?: string
}

export function ColorPicker(props: ColorPickerProps) {
  const { value, onChange } = props
  const panelId = useId()
  const anchor = `--color-${panelId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value) ?? { r: 0, g: 0, b: 0 }))
  const [mode, setMode] = useState<Mode>('hsl')

  // Follow outside changes to `value`, but keep our hue when the hex is the same.
  useEffect(() => {
    if (rgbToHex(hsvToRgb(hsv)) !== value.toLowerCase()) {
      const rgb = hexToRgb(value)
      if (rgb) setHsv(rgbToHsv(rgb))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when value changes
  }, [value])

  function update(next: Hsv) {
    setHsv(next)
    const hex = rgbToHex(hsvToRgb(next))
    if (hex !== value) onChange(hex)
  }

  function setFromHex(hex: string) {
    const rgb = hexToRgb(hex)
    if (rgb) update(rgbToHsv(rgb))
  }

  const rgb = hsvToRgb(hsv)
  const hex = rgbToHex(rgb)
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 }))

  async function pickFromScreen() {
    if (!window.EyeDropper) return
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      setFromHex(sRGBHex)
    } catch {
      // Cancelled with Esc.
    }
  }

  return (
    <>
      <button
        type="button"
        id={props.id}
        className={[styles.swatch, props.className].filter(Boolean).join(' ')}
        style={{ background: hex, anchorName: anchor } as CSSProperties}
        aria-describedby={props['aria-describedby']}
        aria-label={props['aria-label'] ?? `Color ${hex}`}
        aria-haspopup="dialog"
        popoverTarget={panelId}
      />
      <div
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Color picker"
        className={styles.panel}
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        <SaturationArea hsv={hsv} hueColor={hueColor} onChange={update} />
        <div className={styles.row}>
          {window.EyeDropper && (
            <button
              type="button"
              className={styles.eyedropper}
              aria-label="Pick a color from the screen"
              title="Pick a color from the screen"
              onClick={() => void pickFromScreen()}
            >
              <Pipette aria-hidden />
            </button>
          )}
          <HueSlider hue={hsv.h} hueColor={hueColor} onChange={(h) => update({ ...hsv, h })} />
        </div>
        <div className={styles.row}>
          <Select
            className={styles.mode}
            aria-label="Color format"
            value={mode}
            options={MODES}
            onChange={setMode}
          />
          <div className={styles.values}>
            {mode === 'hex' && (
              <ChannelInput
                label="Hex"
                text={hex.slice(1).toUpperCase()}
                parse={(t) => (hexToRgb(t) ? t : null)}
                onCommit={setFromHex}
              />
            )}
            {mode === 'rgb' &&
              (['r', 'g', 'b'] as const).map((k) => (
                <ChannelInput
                  key={k}
                  label={k.toUpperCase()}
                  text={String(rgb[k])}
                  parse={(t) => intIn(t, 0, 255)}
                  onCommit={(n) => update(rgbToHsv({ ...rgb, [k]: n }))}
                />
              ))}
            {mode === 'hsl' &&
              (['h', 's', 'l'] as const).map((k) => {
                const hsl = rgbToHsl(rgb)
                // Keep our own hue for greys, where HSL's hue is meaningless.
                const shown = { ...hsl, h: hsl.s === 0 ? hsv.h : hsl.h }
                return (
                  <ChannelInput
                    key={k}
                    label={k.toUpperCase()}
                    text={String(Math.round(shown[k]))}
                    parse={(t) => intIn(t, 0, k === 'h' ? 359 : 100)}
                    onCommit={(n) => {
                      const next = { ...shown, [k]: n }
                      const nextHsv = rgbToHsv(hslToRgb(next))
                      update(
                        next.s === 0 || next.l === 0 || next.l === 100
                          ? { ...nextHsv, h: next.h }
                          : nextHsv,
                      )
                    }}
                  />
                )
              })}
          </div>
        </div>
      </div>
    </>
  )
}

function intIn(text: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null
  const n = Number(text)
  return n >= min && n <= max ? n : null
}

/** Drag (or use arrow keys) across saturation (x) and brightness (y). */
function SaturationArea(props: { hsv: Hsv; hueColor: string; onChange: (hsv: Hsv) => void }) {
  const { hsv, onChange } = props
  const ref = useRef<HTMLDivElement>(null)

  function fromPointer(e: PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    const s = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))
    const v = Math.min(100, Math.max(0, 100 - ((e.clientY - r.top) / r.height) * 100))
    onChange({ ...hsv, s, v })
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: hsv.s - step },
      ArrowRight: { s: hsv.s + step },
      ArrowUp: { v: hsv.v + step },
      ArrowDown: { v: hsv.v - step },
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    const next = { ...hsv, ...move }
    onChange({
      ...next,
      s: Math.min(100, Math.max(0, next.s)),
      v: Math.min(100, Math.max(0, next.v)),
    })
  }

  return (
    <div
      ref={ref}
      className={styles.area}
      style={{ '--hue': props.hueColor } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-valuetext={`Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        fromPointer(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e)
      }}
    >
      <span
        className={styles.areaHandle}
        style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
        aria-hidden
      />
    </div>
  )
}

function HueSlider(props: { hue: number; hueColor: string; onChange: (hue: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  function fromPointer(e: PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    props.onChange(Math.min(359, Math.max(0, ((e.clientX - r.left) / r.width) * 360)))
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1
    const delta =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown'
        ? -step
        : e.key === 'ArrowRight' || e.key === 'ArrowUp'
          ? step
          : 0
    if (!delta) return
    e.preventDefault()
    props.onChange(Math.min(359, Math.max(0, props.hue + delta)))
  }

  return (
    <div
      ref={ref}
      className={styles.hue}
      role="slider"
      tabIndex={0}
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(props.hue)}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        fromPointer(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e)
      }}
    >
      <span
        className={styles.hueHandle}
        style={{ left: `${(props.hue / 360) * 100}%`, background: props.hueColor }}
        aria-hidden
      />
    </div>
  )
}

/**
 * One value box. Shows the current value, accepts typing, and commits as soon as
 * the text is valid; invalid text snaps back when the field loses focus.
 */
function ChannelInput<T>(props: {
  label: string
  text: string
  parse: (text: string) => T | null
  onCommit: (value: T) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className={styles.value}
      aria-label={props.label}
      value={draft ?? props.text}
      spellCheck={false}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = props.parse(e.target.value)
        if (parsed !== null) props.onCommit(parsed)
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          setDraft(null)
        }
      }}
    />
  )
}
