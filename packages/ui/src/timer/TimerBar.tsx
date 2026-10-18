// SPDX-License-Identifier: GPL-3.0-or-later
// The running timer, shown on the right of the main window's tab bar.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { formatClock, type Client, type Project, type Session } from '@stint/core'
import { IconButton } from '../components/IconButton'
import { Timer } from 'lucide-react'
import { StopAtDialog } from './StopAtDialog'
import { useNow } from './useNow'
import styles from './TimerBar.module.css'

export interface TimerBarProps {
  running: Session | null
  /** The running session's project and client (null while idle). */
  project: Project | null
  client: Client | null
  onStop: () => Promise<unknown>
  onStopAt: (at: number) => Promise<unknown>
}

export function TimerBar({ running, project, client, onStop, onStopAt }: TimerBarProps) {
  const now = useNow(running !== null)
  // The session "Stop at…" was opened for; if that timer stops some other way
  // (tray, shortcut), the dialog no longer applies and stays closed.
  const [stoppingAtId, setStoppingAtId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The label on the left: the running project and client, or the idle text. When
  // it changes, the old one is kept as `leaving` just long enough to fade out.
  const label: Label = running
    ? {
        key: running.id,
        project: project?.name ?? 'Unknown project',
        client: client?.name ?? null,
        color: client?.color ?? null,
      }
    : { key: 'idle', color: null }
  const [current, setCurrent] = useState(label)
  const [leaving, setLeaving] = useState<Label | null>(null)
  // False until the first change, so opening the window doesn't animate.
  const [animated, setAnimated] = useState(false)
  // The outline: a new client color draws itself around the pill over the old
  // one; on stop, the color retracts to reveal the plain border.
  const [trace, setTrace] = useState<Trace>({
    id: 0,
    under: null,
    over: label.color,
    mode: 'static',
  })
  if (current.key !== label.key) {
    // Adjusting state during render (rather than in an effect) swaps both labels
    // in the same frame, so there's no flash of neither or both.
    setLeaving(current)
    setCurrent(label)
    setAnimated(true)
    setTrace(
      label.color
        ? { id: trace.id + 1, under: current.color, over: label.color, mode: 'draw' }
        : { id: trace.id + 1, under: null, over: current.color, mode: 'erase' },
    )
  } else if (
    current.project !== label.project ||
    current.client !== label.client ||
    current.color !== label.color
  ) {
    setCurrent(label)
    if (current.color !== label.color) setTrace({ ...trace, over: label.color })
  }

  const pillRef = usePillResize(label.key)

  function stopNow() {
    setError(null)
    onStop().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  // The clock and buttons are always shown (disabled while idle) so nothing moves
  // when a timer starts or stops. While running, the pill takes the client's color.
  return (
    <div
      ref={pillRef}
      className={styles.pill}
      data-running={running ? '' : undefined}
      data-idle={running ? undefined : ''}
      style={running && client ? ({ '--client-color': client.color } as CSSProperties) : undefined}
    >
      <Outline trace={trace} />
      <span className={styles.label}>
        {leaving && (
          <span
            key={`leaving-${leaving.key}`}
            className={styles.leaving}
            aria-hidden
            onAnimationEnd={() => setLeaving(null)}
          >
            <LabelText label={leaving} />
          </span>
        )}
        <span key={label.key} className={styles.current} data-enter={animated ? '' : undefined}>
          <LabelText label={label} />
        </span>
      </span>
      <span className={styles.elapsed} role="timer" aria-live="off">
        {running ? formatClock(now - running.startedAt) : '0:00:00'}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <IconButton
        label="Stop at an earlier time…"
        disabled={!running}
        onClick={() => setStoppingAtId(running?.id ?? null)}
      >
        <Timer aria-hidden />
      </IconButton>
      <button
        type="button"
        className={styles.stopButton}
        aria-label="Stop"
        title="Stop"
        disabled={!running}
        onClick={stopNow}
      >
        <span className={styles.stopIcon} aria-hidden />
      </button>
      {running && stoppingAtId === running.id && (
        <StopAtDialog
          startedAt={running.startedAt}
          onSubmit={onStopAt}
          onClose={() => setStoppingAtId(null)}
        />
      )}
    </div>
  )
}

type Label = { key: string; project?: string; client?: string | null; color: string | null }

/** Outline colors: `over` draws (or erases) on top of `under`; null = the plain border. */
type Trace = {
  id: number
  under: string | null
  over: string | null
  mode: 'static' | 'draw' | 'erase'
}

function LabelText({ label }: { label: Label }) {
  if (label.project === undefined) return <span className={styles.idleLabel}>No Timer Active</span>
  return (
    <span className={styles.details}>
      <span className={styles.projectName}>{label.project}</span>
      {label.client && <span className={styles.clientName}>{label.client}</span>}
    </span>
  )
}

const RESIZE = { duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
const TRACE = { duration: 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The pill's 1px border, drawn in SVG so a new color can trace itself around it.
 * Each stroke is a path starting at the middle of the right end and running
 * clockwise (down, then left along the bottom). Its length is normalized to 1 and
 * dashed with one dash as long as the whole outline, so sliding the dash offset
 * from 1 to 0 draws it in, and from 0 to -1 retracts it in the same direction.
 */
function Outline({ trace }: { trace: Trace }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const overRef = useRef<SVGPathElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Follow the pill's size, every frame while its width animates.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect()
      setSize((old) => (old?.width === width && old.height === height ? old : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  // Play the trace each time `trace.id` changes. The inline style holds the end
  // state, which shows once the animation finishes.
  useLayoutEffect(() => {
    const path = overRef.current
    if (!path || trace.mode === 'static' || reducedMotion()) return
    const offsets = trace.mode === 'draw' ? [1, 0] : [0, -1]
    const animation = path.animate(
      // Visible throughout, even when the end state hides it (after a retract).
      offsets.map((strokeDashoffset) => ({ strokeDashoffset, visibility: 'visible' })),
      TRACE,
    )
    return () => animation.cancel()
  }, [trace.id, trace.mode])

  const d = size && outlinePath(size.width, size.height)
  return (
    <svg ref={svgRef} className={styles.outline} aria-hidden>
      {d && (
        <>
          <path className={styles.outlineBase} d={d} />
          {trace.under && <path d={d} style={{ stroke: trace.under }} />}
          {trace.over && (
            <path
              ref={overRef}
              d={d}
              pathLength={1}
              strokeDasharray="1 1"
              style={{
                stroke: trace.over,
                strokeDashoffset: trace.mode === 'erase' ? -1 : 0,
                // Hidden once retracted: rounding can leave a dot of the dash showing.
                visibility: trace.mode === 'erase' ? 'hidden' : undefined,
              }}
            />
          )}
        </>
      )}
    </svg>
  )
}

/**
 * A pill outline for a `width` × `height` box, inset half a pixel so the 1px
 * stroke lands on whole pixels. Starts at the middle of the right end and goes
 * clockwise.
 */
function outlinePath(width: number, height: number): string {
  const top = 0.5
  const bottom = height - 0.5
  const r = (bottom - top) / 2
  const left = 0.5 + r
  const right = width - 0.5 - r
  if (right < left) return ''
  return [
    `M ${width - 0.5} ${height / 2}`,
    `A ${r} ${r} 0 0 1 ${right} ${bottom}`,
    `L ${left} ${bottom}`,
    `A ${r} ${r} 0 0 1 ${left} ${top}`,
    `L ${right} ${top}`,
    `A ${r} ${r} 0 0 1 ${width - 0.5} ${height / 2}`,
    'Z',
  ].join(' ')
}

/**
 * Eases the pill's width from its old size to its new one whenever the label
 * (`key`) changes. The browser can't transition `width: auto`, so this measures
 * both sizes and animates between them with the Web Animations API.
 */
function usePillResize(key: string) {
  const pillRef = useRef<HTMLDivElement>(null)
  const lastKey = useRef(key)
  const lastWidth = useRef(0)
  const animation = useRef<Animation | null>(null)

  // Runs after every render, before the browser paints.
  useLayoutEffect(() => {
    const pill = pillRef.current
    if (!pill) return
    const inFlight = animation.current?.playState === 'running'
    if (lastKey.current !== key) {
      lastKey.current = key
      // Mid-animation, start from the width on screen now; otherwise the last size.
      const from = inFlight ? pill.getBoundingClientRect().width : lastWidth.current
      animation.current?.cancel()
      const to = pill.getBoundingClientRect().width
      lastWidth.current = to
      if (from > 0 && from !== to && !reducedMotion()) {
        animation.current = pill.animate([{ width: `${from}px` }, { width: `${to}px` }], RESIZE)
      }
    } else if (!inFlight) {
      // Track other size changes (like the clock reaching 10 hours).
      lastWidth.current = pill.getBoundingClientRect().width
    }
  })

  return pillRef
}
