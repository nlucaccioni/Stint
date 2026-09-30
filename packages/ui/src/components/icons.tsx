// SPDX-License-Identifier: GPL-3.0-or-later
// Placeholder icons (simple inline SVG, inherit the text color).

export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
    </svg>
  )
}

export function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  )
}
