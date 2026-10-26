// SPDX-License-Identifier: GPL-3.0-or-later
// Time and date+time fields in the app's style.
//
// TimeInput keeps the native <input type="time">: its hour/minute segments are fast
// to type into and follow the system's 12/24-hour setting. Only its looks change
// (mono digits, our focus color, no clock popup, which the OS draws).
// DateTimeInput pairs a DateInput with a TimeInput.
import type { InputHTMLAttributes } from 'react'
import { DateInput } from './DateInput'
import styles from './TimeInput.module.css'

export interface TimeInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  /** "HH:MM" (24-hour), or "" for none. */
  value: string
  onChange: (value: string) => void
}

export function TimeInput({ value, onChange, className, ...rest }: TimeInputProps) {
  return (
    <input
      {...rest}
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[styles.time, className].filter(Boolean).join(' ')}
    />
  )
}

export interface DateTimeInputProps {
  /** "YYYY-MM-DDTHH:MM" (local), like <input type="datetime-local">. */
  value: string
  onChange: (value: string) => void
  weekStartsOn?: number
  /** Set by Field: goes to the date button, which the label then points at. */
  id?: string
  className?: string
  'aria-describedby'?: string
}

export function DateTimeInput(props: DateTimeInputProps) {
  const [date = '', time = ''] = props.value.split('T')
  return (
    // Field passes its control class; the two fields inside carry their own styling.
    <div className={styles.pair}>
      <DateInput
        id={props.id}
        className={styles.pairDate}
        aria-describedby={props['aria-describedby']}
        value={date}
        weekStartsOn={props.weekStartsOn}
        onChange={(d) => props.onChange(`${d}T${time}`)}
      />
      <TimeInput
        className={styles.pairTime}
        aria-label="Time"
        aria-describedby={props['aria-describedby']}
        value={time}
        onChange={(t) => props.onChange(`${date}T${t}`)}
        required
      />
    </div>
  )
}
