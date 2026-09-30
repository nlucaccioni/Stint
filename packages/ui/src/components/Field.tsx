// SPDX-License-Identifier: GPL-3.0-or-later
import { cloneElement, useId, type InputHTMLAttributes, type ReactElement } from 'react'
import styles from './Field.module.css'

export interface FieldProps {
  label: string
  hint?: string
  /** A single input/select; it gets the id, styling, and aria wiring. */
  children: ReactElement<{ id?: string; className?: string; 'aria-describedby'?: string }>
}

/** Label + control + optional hint, wired up for screen readers. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {cloneElement(children, {
        id,
        className: [styles.control, children.props.className].filter(Boolean).join(' '),
        'aria-describedby': hintId,
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function Checkbox({
  label,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  )
}
