// SPDX-License-Identifier: GPL-3.0-or-later
// Drag to tick: press on a row's box and move over other rows to give them the
// same state (ticked or not) as the first one got. Ends wherever the pointer is
// let go. Used by the Time tab and the billing session lists.
import { useEffect, useRef, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'

export type DragTick = ReturnType<typeof useDragTick>

export function useDragTick(
  isTicked: (id: string) => boolean,
  tick: (id: string, on: boolean) => void,
) {
  const dragTo = useRef<boolean | null>(null)
  useEffect(() => {
    const end = () => {
      dragTo.current = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  return {
    /** On the box's wrapper: a press ticks (or unticks) it and starts the drag. */
    start(id: string, e: PointerEvent) {
      if (e.button !== 0) return
      e.preventDefault() // no text selection while dragging
      const on = !isTicked(id)
      dragTo.current = on
      tick(id, on)
    },
    /** On the row: the pointer moved onto it, mid-drag. */
    enter(id: string) {
      if (dragTo.current !== null) tick(id, dragTo.current)
    },
    /**
     * The checkbox's own handlers. A pointer press already ticked it (see start),
     * so the click that follows the release must do nothing: the browser would
     * toggle the box back, and React would report that as a change, leaving the
     * box drawn ticked while the row wasn't. A mouse or touch click has a click
     * count (detail); a keyboard click (Space) has none, and toggles as usual.
     */
    checkbox(id: string) {
      const fromPointer = (e: { nativeEvent: Event }) =>
        (e.nativeEvent as globalThis.MouseEvent).detail > 0
      return {
        onClick(e: MouseEvent) {
          if (fromPointer(e)) e.preventDefault()
        },
        onChange(e: ChangeEvent<HTMLInputElement>) {
          if (!fromPointer(e)) tick(id, e.target.checked)
        },
      }
    },
  }
}
