// SPDX-License-Identifier: GPL-3.0-or-later
// A project's or client's time on the Projects tab, with the other kind of time
// (billable vs non-billable) in small type under it when there is any:
// "+$0:45" or "+(crossed-out $)0:45". The tooltip spells both out.
import type { SVGProps } from 'react'
import { DollarSign } from 'lucide-react'
import { formatClock, formatHoursMinutes } from '@stint/core'
import styles from './ClientsView.module.css'

/** Less than this isn't worth a second line (it would read "+0:00"). */
const MIN_OTHER_MS = 60_000

export interface TimeStackProps {
  ms: number
  /** Time of the other kind, shown under `ms`. */
  otherMs: number
  /** What kind `otherMs` is. */
  otherBillable: boolean
  /** What `ms` is, for the tooltip ("Unbilled billable time"). */
  label: string
  /** Hours:minutes instead of to the second (client totals); the tooltip keeps the seconds. */
  short?: boolean
}

export function TimeStack({ ms, otherMs, otherBillable, label, short }: TimeStackProps) {
  const showOther = otherMs >= MIN_OTHER_MS
  const otherLabel = `${formatClock(otherMs)} ${otherBillable ? 'billable' : 'non-billable'}`
  const Icon = otherBillable ? DollarSign : DollarSignOff
  // "5:30:12 unbilled billable time. Resets when…": the exact time leads when the
  // figure itself is rounded to minutes.
  const title = [short ? `${formatClock(ms)} ${label[0]!.toLowerCase()}${label.slice(1)}` : label]
  if (showOther) title.push(`+${otherLabel}`)
  return (
    <span className={styles.timeStack} title={title.join('\n')}>
      <span className={styles.elapsed}>{short ? formatHoursMinutes(ms) : formatClock(ms)}</span>
      {showOther && (
        <span className={styles.otherTime}>
          +<Icon aria-hidden />
          {formatHoursMinutes(otherMs)}
          <span className={styles.visuallyHidden}>
            {' '}
            {otherBillable ? 'billable' : 'non-billable'}
          </span>
        </span>
      )}
    </span>
  )
}

/** Lucide's DollarSign with a slash through it (lucide has no "dollar off" icon). */
function DollarSignOff(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      <line x1="4" x2="20" y1="4" y2="20" />
    </svg>
  )
}
