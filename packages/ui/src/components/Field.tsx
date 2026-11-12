// SPDX-License-Identifier: GPL-3.0-or-later
import { cloneElement, useId, type ComponentProps, type ReactElement } from 'react'
import { Check } from 'lucide-react'
import styles from './Field.module.css'

export interface FieldProps {
  label: string
  hint?: string
  /** Shown in place of the hint, in red, when the value can't be used. */
  error?: string | null
  /** A single input/select; it gets the id, styling, and aria wiring. */
  children: ReactElement<{
    id?: string
    className?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }>
}

/** Label + control + optional hint, wired up for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = error || hint ? `${id}-hint` : undefined
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {cloneElement(children, {
        id,
        className: [styles.control, children.props.className].filter(Boolean).join(' '),
        'aria-describedby': hintId,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p id={hintId} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** A styled checkbox on its own (e.g. in a list row); the native one is OS-drawn. */
export function CheckInput({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className={[styles.checkInput, className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}

/** A styled checkbox with its label beside it. */
export function Checkbox({ label, ...rest }: { label: string } & ComponentProps<'input'>) {
  return (
    <label className={styles.checkbox}>
      <CheckInput {...rest} />
      {label}
    </label>
  )
}

/** A checkbox drawn as a square box with a check (Figma: Billable). Put it in a Field. */
export function CheckBox(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  className?: string
  'aria-describedby'?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      id={props.id}
      aria-checked={props.checked}
      aria-describedby={props['aria-describedby']}
      // Field passes its control class; the box has its own look instead.
      className={styles.checkBox}
      onClick={() => props.onChange(!props.checked)}
    >
      {props.checked && <Check aria-hidden />}
    </button>
  )
}
