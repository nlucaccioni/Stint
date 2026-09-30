// SPDX-License-Identifier: GPL-3.0-or-later
import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
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
