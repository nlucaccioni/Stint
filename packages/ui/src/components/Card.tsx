// SPDX-License-Identifier: GPL-3.0-or-later
// A titled section card (Figma: Billing sections). Used by Billing and Settings.
// With an `empty` message it becomes a dashed outline with the message beside the
// title, and its children aren't rendered.
import type { ReactNode } from 'react'
import styles from './Card.module.css'

export interface CardProps {
  title: string
  /** Shown on the right of the title row, e.g. a Reset button. */
  actions?: ReactNode
  /** When set, the card is empty: dashed outline, this message, no children. */
  empty?: string | false
  /** 8px under the title instead of 12px: for a card holding a table (Billing). */
  compact?: boolean
  children?: ReactNode
}

export function Card({ title, actions, empty, compact, children }: CardProps) {
  return (
    <section
      className={styles.card}
      data-empty={empty ? '' : undefined}
      data-compact={compact || undefined}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {empty ? <p className={styles.emptyNote}>{empty}</p> : actions}
      </header>
      {!empty && children}
    </section>
  )
}
