// SPDX-License-Identifier: GPL-3.0-or-later
// A scrollbar drawn over the content instead of beside it. A native scrollbar
// always takes its own strip of width (Chromium dropped overlay scrollbars), and
// content can't paint under it, so the cards' glows stopped short of the window
// edge and the content shifted when a page started scrolling. The scroll area
// hides its native scrollbar; wheel, keyboard and touch scrolling are unchanged,
// and this thumb follows along and can be dragged.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import styles from './OverlayScrollbar.module.css'

const MIN_THUMB = 24

interface Thumb {
  top: number
  height: number
}

export function OverlayScrollbar({ target }: { target: HTMLElement | null }) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; scrollTop: number } | null>(null)
  const [thumb, setThumb] = useState<Thumb | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!target) return
    const el = target
    function measure() {
      const trackHeight = track.current?.clientHeight ?? 0
      const scrollable = el.scrollHeight - el.clientHeight
      if (scrollable <= 0 || trackHeight === 0) {
        setThumb(null)
        return
      }
      const height = Math.max(MIN_THUMB, (trackHeight * el.clientHeight) / el.scrollHeight)
      setThumb({ height, top: (el.scrollTop / scrollable) * (trackHeight - height) })
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // The page's size changes as content loads, cards open and the window resizes.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    if (track.current) observer.observe(track.current)
    return () => {
      el.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [target])

  /** Pixels of scrolling per pixel of thumb movement. */
  function scrollPerPixel() {
    if (!target || !thumb || !track.current) return 0
    const room = track.current.clientHeight - thumb.height
    return room > 0 ? (target.scrollHeight - target.clientHeight) / room : 0
  }

  function onThumbDown(e: PointerEvent<HTMLDivElement>) {
    if (!target) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, scrollTop: target.scrollTop }
    setDragging(true)
  }

  function endDrag() {
    drag.current = null
    setDragging(false)
  }

  function onThumbMove(e: PointerEvent<HTMLDivElement>) {
    if (!target || !drag.current) return
    target.scrollTo({
      top: drag.current.scrollTop + (e.clientY - drag.current.y) * scrollPerPixel(),
    })
  }

  // Clicking the track pages toward the click, like a native scrollbar.
  function onTrackDown(e: PointerEvent<HTMLDivElement>) {
    if (!target || !thumb) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const page = target.clientHeight * 0.9
    target.scrollBy({ top: y < thumb.top ? -page : page })
  }

  return (
    <div ref={track} className={styles.track} aria-hidden onPointerDown={onTrackDown}>
      {thumb && (
        <div
          className={styles.thumb}
          data-dragging={dragging || undefined}
          style={{ top: thumb.top, height: thumb.height }}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
    </div>
  )
}
