// SPDX-License-Identifier: GPL-3.0-or-later
// Create Batch's "Client or Project": the clients with unbilled time, each with
// its projects indented under it, where several of one client's projects can be
// ticked. Looks and behaves like Select (a native popover, arrow keys), but stays
// open while you tick.
import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Minus } from 'lucide-react'
import type { Client, Project } from '@stint/core'
import styles from '../components/Select.module.css'

export interface ProjectChoice {
  clientId: string
  projectIds: ReadonlySet<string>
}

export interface ProjectPickerProps {
  /** Clients to offer, each with its projects that can be billed, in the user's order. */
  options: readonly { client: Client; projects: readonly Project[] }[]
  value: ProjectChoice
  onChange: (value: ProjectChoice) => void
  /** Set by Field. */
  id?: string
  className?: string
  'aria-describedby'?: string
}

export function ProjectPicker(props: ProjectPickerProps) {
  const { options, value, onChange } = props
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const anchor = `--picker-${listId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const current = options.find((o) => o.client.id === value.clientId)

  function optionButtons(): HTMLButtonElement[] {
    return [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])]
  }

  function onToggle(e: { newState?: string }) {
    if (e.newState !== 'open') return
    const buttons = optionButtons()
    ;(buttons.find((b) => b.getAttribute('aria-selected') === 'true') ?? buttons[0])?.focus()
  }

  function onKeyDown(e: KeyboardEvent) {
    const all = optionButtons()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'ArrowDown'
        ? Math.min(at + 1, all.length - 1)
        : e.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : null
    if (next === null) return
    e.preventDefault()
    all[next]?.focus()
  }

  /** A client: all of its projects. */
  function pickClient(option: (typeof options)[number]) {
    onChange({
      clientId: option.client.id,
      projectIds: new Set(option.projects.map((p) => p.id)),
    })
  }

  /** A project: ticked or unticked; one of another client starts over with just it. */
  function pickProject(clientId: string, projectId: string) {
    if (clientId !== value.clientId) {
      onChange({ clientId, projectIds: new Set([projectId]) })
      return
    }
    const next = new Set(value.projectIds)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    onChange({ clientId, projectIds: next })
  }

  return (
    <>
      <button
        type="button"
        id={props.id}
        className={[styles.trigger, props.className].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-describedby={props['aria-describedby']}
        popoverTarget={listId}
        style={{ anchorName: anchor } as CSSProperties}
      >
        <span className={styles.value}>
          {current && <Dot color={current.client.color} />}
          {current?.client.name}
          {current && (
            <span className={styles.summary}>
              {' '}
              · {summarize(current.projects, value.projectIds)}
            </span>
          )}
        </span>
        <ChevronDown className={styles.chevron} aria-hidden />
      </button>
      <div
        ref={listRef}
        id={listId}
        popover="auto"
        role="listbox"
        aria-multiselectable
        className={styles.list}
        style={{ positionAnchor: anchor } as CSSProperties}
        onToggle={onToggle}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => {
          const isCurrent = option.client.id === value.clientId
          const ticked = isCurrent
            ? option.projects.filter((p) => value.projectIds.has(p.id)).length
            : 0
          const all = ticked > 0 && ticked === option.projects.length
          return [
            <button
              key={option.client.id}
              type="button"
              role="option"
              aria-selected={all}
              className={styles.option}
              onClick={() => pickClient(option)}
            >
              <span className={styles.label}>
                <Dot color={option.client.color} />
                {option.client.name}
              </span>
              {all ? (
                <Check className={styles.check} aria-hidden />
              ) : (
                ticked > 0 && <Minus className={styles.check} aria-label="Some Projects" />
              )}
            </button>,
            ...option.projects.map((p) => {
              const on = isCurrent && value.projectIds.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={styles.option}
                  data-indent
                  data-ticked={on || undefined}
                  onClick={() => pickProject(option.client.id, p.id)}
                >
                  <span>{p.name}</span>
                  {on && <Check className={styles.check} aria-hidden />}
                </button>
              )
            }),
          ]
        })}
      </div>
    </>
  )
}

/** "All Projects", "Website", "Website, App", "3 Projects", or "No Projects". */
function summarize(projects: readonly Project[], ids: ReadonlySet<string>): string {
  const picked = projects.filter((p) => ids.has(p.id))
  if (picked.length === 0) return 'No Projects'
  if (picked.length === projects.length && projects.length > 1) return 'All Projects'
  if (picked.length > 2) return `${picked.length} Projects`
  return picked.map((p) => p.name).join(', ')
}

function Dot({ color }: { color: string }) {
  return (
    <span className={styles.dot} style={{ '--dot-color': color } as CSSProperties} aria-hidden />
  )
}
