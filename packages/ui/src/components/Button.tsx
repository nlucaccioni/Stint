// SPDX-License-Identifier: GPL-3.0-or-later
import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'subtle' | 'ghost' | 'danger'
  /** md: 12px text and icons; sm: 10px (Tertiary and Show Archived in the design). */
  size?: 'md' | 'sm'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
  return <button type={type} className={classes.filter(Boolean).join(' ')} {...rest} />
}
