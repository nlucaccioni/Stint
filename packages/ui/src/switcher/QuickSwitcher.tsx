// SPDX-License-Identifier: GPL-3.0-or-later
// Command-palette style switcher: type to find a project, Enter to start it
// (or switch to it, or stop it if it's already running).
import { useMemo, useState, type KeyboardEvent } from 'react'
import { Search, Square, Star } from 'lucide-react'
import {
  favoriteSlot,
  fuzzySearch,
  projectColor,
  type Client,
  type Project,
  type Session,
} from '@stint/core'
import styles from './QuickSwitcher.module.css'

export interface QuickSwitcherProps {
  projects: readonly Project[]
  clients: readonly Client[]
  running: Session | null
  favorites: readonly (string | null)[]
  /** Most recently used first. */
  recentProjectIds: readonly string[]
  onToggle: (projectId: string) => Promise<unknown>
  onStop: () => Promise<unknown>
  onClose: () => void
}

type Row =
  | { kind: 'stop'; id: 'stop'; text: string }
  | { kind: 'project'; id: string; text: string; project: Project; client: Client }

const MAX_ROWS = 50

export function QuickSwitcher(props: QuickSwitcherProps) {
  const { projects, clients, running, favorites, recentProjectIds } = props
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Startable projects in the "nothing typed" order: favorites, recent, then the rest.
  const ordered = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const rows: Row[] = []
    for (const p of projects) {
      const client = clientById.get(p.clientId)
      if (!client || p.archived || client.archived) continue
      rows.push({
        kind: 'project',
        id: p.id,
        text: `${p.name} · ${client.name}`,
        project: p,
        client,
      })
    }
    const rank = (id: string) => {
      const fav = favoriteSlot(favorites, id)
      if (fav !== null) return fav
      const recent = recentProjectIds.indexOf(id)
      if (recent !== -1) return 100 + recent
      return 1000
    }
    return rows.sort((a, b) => rank(a.id) - rank(b.id) || a.text.localeCompare(b.text))
  }, [projects, clients, favorites, recentProjectIds])

  const rows = useMemo(() => {
    const runningRow = ordered.find((r) => r.id === running?.projectId)
    const stop: Row[] = runningRow
      ? [{ kind: 'stop', id: 'stop', text: `Stop ${runningRow.text}` }]
      : []
    return fuzzySearch(query, [...stop, ...ordered]).slice(0, MAX_ROWS)
  }, [query, ordered, running])

  const active = Math.min(selected, Math.max(rows.length - 1, 0))

  async function choose(row: Row | undefined) {
    if (!row) return
    setError(null)
    try {
      if (row.kind === 'stop') await props.onStop()
      else await props.onToggle(row.id)
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setSelected((active + step + rows.length) % Math.max(rows.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void choose(rows[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onClose()
    }
  }

  return (
    <div className={styles.panel}>
      <label className={styles.search}>
        <Search size={18} aria-hidden />
        <input
          className={styles.input}
          value={query}
          placeholder="Start a project…"
          aria-label="Search projects"
          aria-controls="switcher-results"
          aria-activedescendant={rows[active] ? `switcher-${rows[active].id}` : undefined}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={onKeyDown}
        />
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <ul id="switcher-results" className={styles.results} role="listbox" aria-label="Projects">
        {rows.length === 0 && <li className={styles.empty}>No matching projects</li>}
        {rows.map((row, i) => {
          const isRunning = row.kind === 'project' && row.id === running?.projectId
          const slot = row.kind === 'project' ? favoriteSlot(favorites, row.id) : null
          return (
            <li
              key={row.id}
              id={`switcher-${row.id}`}
              role="option"
              aria-selected={i === active}
              className={styles.row}
              onMouseMove={() => setSelected(i)}
              onClick={() => void choose(row)}
            >
              {row.kind === 'stop' ? (
                <Square size={12} fill="currentColor" className={styles.stopIcon} aria-hidden />
              ) : (
                <span
                  className={styles.swatch}
                  style={{ background: projectColor(row.project, row.client) }}
                  aria-hidden
                />
              )}
              <span className={styles.label}>
                {row.kind === 'stop' ? (
                  row.text
                ) : (
                  <>
                    {row.project.name}
                    <span className={styles.client}> · {row.client.name}</span>
                  </>
                )}
              </span>
              {slot !== null && (
                <span className={styles.slot} title={`Favorite ${slot}`}>
                  <Star size={11} fill="currentColor" aria-hidden />
                  {slot}
                </span>
              )}
              {isRunning && <span className={styles.tag}>Running</span>}
              {i === active && (
                <span className={styles.hint}>
                  {row.kind === 'stop' || isRunning ? 'Stop' : running ? 'Switch' : 'Start'} ↵
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
