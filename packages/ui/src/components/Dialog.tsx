// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useId, useRef, type ReactNode } from 'react'
import styles from './Dialog.module.css'

export interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Modal dialog using the native <dialog> element: it traps focus, closes on
 * Escape, and blocks the page behind it. Render it only while it should be open.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault() // let React unmount it rather than the browser closing it
        onClose()
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children}
    </dialog>
  )
}
