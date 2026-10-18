// SPDX-License-Identifier: GPL-3.0-or-later
// A small borderless button holding one icon (settings, ⋯, chevrons, play/stop).
// The label is required: it's the accessible name and the tooltip.
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import styles from './IconButton.module.css'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  /** md: 24px (Figma's Icon button, e.g. Settings); sm: 16px, for ⋯ and chevrons inside rows. */
  size?: 'md' | 'sm'
  /** A lucide icon; it's sized by the button. */
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  size = 'sm',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[styles.button, styles[size], className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}
