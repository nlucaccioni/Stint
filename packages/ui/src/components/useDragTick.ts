// SPDX-License-Identifier: GPL-3.0-or-later
// Drag to tick: press on a row's box and move over other rows to give them the
// same state (ticked or not) as the first one got. Ends wherever the pointer is
// let go. Used by the Time tab and the billing session lists.
import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

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
     * On the checkbox: a pointer press already ticked it (see start), and the
     * click that follows would undo that. Keyboard (Space) clicks have no detail
     * and still toggle through onChange.
     */
    onClick(e: MouseEvent) {
      if (e.detail > 0) e.preventDefault()
    },
  }
}
