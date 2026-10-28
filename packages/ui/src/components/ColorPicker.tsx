// SPDX-License-Identifier: GPL-3.0-or-later
// A swatch that opens a color picker (Figma: Color Picker): a hue/saturation
// square, a saturation slider, an eyedropper, and the value as HSB, RGB or hex.
//
// Colors are always at full brightness (HSV value 100): client colors glow
// throughout the app, and a dark color barely glows. So there's no brightness
// control, and typed or picked colors are brightened to match.
//
// The panel is a native popover anchored to the swatch, like Menu and Select. The
// picker works in HSV internally so the hue survives dragging through white.
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type Hsv, type Rgb } from '@stint/core'
import { Pipette } from 'lucide-react'
import { Select } from './Select'
import styles from './ColorPicker.module.css'

type Mode = 'hsb' | 'rgb' | 'hex'
const MODES = [
  { value: 'rgb', label: 'RGB' },
  { value: 'hex', label: 'Hex' },
  { value: 'hsb', label: 'HSB' },
] as const

/** Any color as HSV at full brightness, keeping its hue and saturation. */
const bright = (rgb: Rgb): Hsv => ({ ...rgbToHsv(rgb), v: 100 })

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
  /**
   * The app's own screen picker, if it has one (Stint on Windows/Linux, where the
   * browser eyedropper shows no magnifier outside the window). Resolves with
   * "#rrggbb", or null if cancelled. Without it, the browser's EyeDropper is used.
   */
  pickScreenColor?: () => Promise<string | null>
}

export function ColorPicker(props: ColorPickerProps) {
  const { value, onChange } = props
  const panelId = useId()
  const anchor = `--color-${panelId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [hsv, setHsv] = useState<Hsv>(() => bright(hexToRgb(value) ?? { r: 255, g: 255, b: 255 }))
  const [mode, setMode] = useState<Mode>('hsb')

  // Follow outside changes to `value` (adjusting state during render, React's
  // recommended pattern), but keep our hue when the hex is the same.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    const rgb = hexToRgb(value)
    if (rgb && rgbToHex(hsvToRgb(hsv)) !== value.toLowerCase()) setHsv(bright(rgb))
  }

  function update(next: Hsv) {
    setHsv(next)
    const hex = rgbToHex(hsvToRgb(next))
    if (hex !== value) onChange(hex)
  }

  function setFromHex(hex: string) {
    const rgb = hexToRgb(hex)
    if (rgb) update(bright(rgb))
  }

  const rgb = hsvToRgb(hsv)
  const hex = rgbToHex(rgb)
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 }))

  const canPick = Boolean(props.pickScreenColor || window.EyeDropper)

  async function pickFromScreen() {
    try {
      const picked = props.pickScreenColor
        ? await props.pickScreenColor()
        : window.EyeDropper
          ? (await new window.EyeDropper().open()).sRGBHex
          : null
      if (picked) setFromHex(picked)
    } catch {
      // Cancelled with Esc.
    }
  }

  return (
    <>
      <button
        type="button"
        id={props.id}
        // Field passes its control class; the swatch keeps its own size instead.
        className={styles.swatch}
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
        <HueSaturationArea hsv={hsv} onChange={update} />
        <div className={styles.row}>
          {canPick && (
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
          <SaturationSlider
            saturation={hsv.s}
            hueColor={hueColor}
            color={hex}
            onChange={(s) => update({ ...hsv, s })}
          />
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
                  onCommit={(n) => update(bright({ ...rgb, [k]: n }))}
                />
              ))}
            {/* Hue and saturation only: brightness is always 100. */}
            {mode === 'hsb' &&
              (['h', 's'] as const).map((k) => (
                <ChannelInput
                  key={k}
                  label={k.toUpperCase()}
                  text={String(Math.round(hsv[k]))}
                  parse={(t) => intIn(t, 0, k === 'h' ? 359 : 100)}
                  onCommit={(n) => update({ ...hsv, [k]: n })}
                />
              ))}
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

/** Drag (or use arrow keys) across hue (x) and saturation (y, white at the bottom). */
function HueSaturationArea(props: { hsv: Hsv; onChange: (hsv: Hsv) => void }) {
  const { hsv, onChange } = props
  const ref = useRef<HTMLDivElement>(null)

  function fromPointer(e: PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    const h = Math.min(359, Math.max(0, ((e.clientX - r.left) / r.width) * 360))
    const s = Math.min(100, Math.max(0, 100 - ((e.clientY - r.top) / r.height) * 100))
    onChange({ ...hsv, h, s })
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { h: hsv.h - step },
      ArrowRight: { h: hsv.h + step },
      ArrowUp: { s: hsv.s + step },
      ArrowDown: { s: hsv.s - step },
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    const next = { ...hsv, ...move }
    onChange({
      ...next,
      h: Math.min(359, Math.max(0, next.h)),
      s: Math.min(100, Math.max(0, next.s)),
    })
  }

  return (
    <div
      ref={ref}
      className={styles.area}
      role="slider"
      tabIndex={0}
      aria-label="Hue and saturation"
      aria-valuetext={`Hue ${Math.round(hsv.h)}, saturation ${Math.round(hsv.s)}%`}
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
        style={{ left: `${(hsv.h / 360) * 100}%`, top: `${100 - hsv.s}%` }}
        aria-hidden
      />
    </div>
  )
}

/** White on the left to the full hue on the right. */
function SaturationSlider(props: {
  saturation: number
  /** The hue at full saturation, for the right end of the track. */
  hueColor: string
  /** The current color, for the handle. */
  color: string
  onChange: (saturation: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  function fromPointer(e: PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    props.onChange(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
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
    props.onChange(Math.min(100, Math.max(0, props.saturation + delta)))
  }

  return (
    <div
      ref={ref}
      className={styles.saturation}
      style={{ '--hue': props.hueColor } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label="Saturation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.saturation)}
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
        className={styles.sliderHandle}
        style={{ left: `${props.saturation}%`, background: props.color }}
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
