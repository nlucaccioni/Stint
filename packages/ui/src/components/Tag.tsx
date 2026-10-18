// SPDX-License-Identifier: GPL-3.0-or-later
// A small outlined label next to a name: "Non-billable", "Archived".
import type { ReactNode } from 'react'
import styles from './Tag.module.css'

export interface TagProps {
  /** muted = secondary grey; tertiary = the quieter grey used for "Non-billable". */
  tone?: 'muted' | 'tertiary'
  children: ReactNode
}

export function Tag({ tone = 'muted', children }: TagProps) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>
}
