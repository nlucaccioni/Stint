// SPDX-License-Identifier: GPL-3.0-or-later
// A small filled label next to a name, e.g. "Non-billable" (Figma: Billable Pill).
import type { ReactNode } from 'react'
import styles from './Tag.module.css'

export interface TagProps {
  children: ReactNode
}

export function Tag({ children }: TagProps) {
  return <span className={styles.tag}>{children}</span>
}
