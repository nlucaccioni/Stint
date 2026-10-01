// SPDX-License-Identifier: GPL-3.0-or-later
// Clients and their projects: list, add, edit, archive. Receives data and
// callbacks as props, so desktop and (later) web can both use it.
import { useState } from 'react'
import {
  favoriteSlot,
  formatMoney,
  projectColor,
  type Client,
  type ClientEdits,
  type ClientInput,
  type Project,
  type ProjectEdits,
  type ProjectInput,
} from '@stint/core'
import { Button } from '../components/Button'
import { Checkbox } from '../components/Field'
import { Play, Plus, Square, Star } from 'lucide-react'
import { ClientForm } from './ClientForm'
import { ProjectForm } from './ProjectForm'
import styles from './ClientsView.module.css'

/** Suggested colors for new clients, cycled in order. */
const PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#64748b',
]

export interface ClientsViewProps {
  clients: readonly Client[]
  projects: readonly Project[]
  /** Projects with recorded time: these (and their clients) can't be deleted. */
  projectIdsWithTime: ReadonlySet<string>
  defaultCurrency: string
  /** Project whose timer is running, if any. */
  runningProjectId: string | null
  /** Favorite slots (index 0 = slot 1); assigned in Settings. */
  favorites: readonly (string | null)[]
  onToggleTimer: (projectId: string) => Promise<unknown>
  onCreateClient: (input: ClientInput) => Promise<unknown>
  onUpdateClient: (id: string, edits: ClientEdits) => Promise<unknown>
  onCreateProject: (input: ProjectInput) => Promise<unknown>
  onUpdateProject: (id: string, edits: ProjectEdits) => Promise<unknown>
  onDeleteClient: (id: string) => Promise<unknown>
  onDeleteProject: (id: string) => Promise<unknown>
}

type Editing =
  | { kind: 'client'; client?: Client }
  | { kind: 'project'; client: Client; project?: Project }
  | null

export function ClientsView(props: ClientsViewProps) {
  const { clients, projects } = props
  const [editing, setEditing] = useState<Editing>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasArchived = clients.some((c) => c.archived) || projects.some((p) => p.archived)
  const visibleClients = clients.filter((c) => showArchived || !c.archived)
  const close = () => setEditing(null)

  function clientDeletion(client: Client) {
    const own = projects.filter((p) => p.clientId === client.id)
    const n = own.length
    return {
      allowed: !own.some((p) => props.projectIdsWithTime.has(p.id)),
      question:
        n === 0
          ? `Delete "${client.name}"?`
          : `Delete "${client.name}" and its ${n} project${n === 1 ? '' : 's'}?`,
      onDelete: async () => {
        await props.onDeleteClient(client.id)
        close()
      },
    }
  }

  /** For actions taken straight from the list (no form to show the error in). */
  function act(action: Promise<unknown>) {
    setError(null)
    action.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <section className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Clients & projects</h1>
        {hasArchived && (
          <Checkbox
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
        )}
        <Button variant="primary" onClick={() => setEditing({ kind: 'client' })}>
          Add client
        </Button>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {clients.length === 0 ? (
        <div className={styles.empty}>
          <p>No clients yet. Add a client, then create projects to track time against.</p>
        </div>
      ) : (
        <ul className={styles.clients}>
          {visibleClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              projects={projects.filter(
                (p) => p.clientId === client.id && (showArchived || !p.archived),
              )}
              onEdit={() => setEditing({ kind: 'client', client })}
              onArchive={() => act(props.onUpdateClient(client.id, { archived: !client.archived }))}
              onAddProject={() => setEditing({ kind: 'project', client })}
              onEditProject={(project) => setEditing({ kind: 'project', client, project })}
              runningProjectId={props.runningProjectId}
              favorites={props.favorites}
              onToggleTimer={(project) => act(props.onToggleTimer(project.id))}
              onArchiveProject={(project) =>
                act(props.onUpdateProject(project.id, { archived: !project.archived }))
              }
            />
          ))}
        </ul>
      )}

      {editing?.kind === 'client' && (
        <ClientForm
          client={editing.client}
          defaultColor={PALETTE[clients.length % PALETTE.length]!}
          defaultCurrency={props.defaultCurrency}
          onSubmit={async (values) => {
            if (editing.client) await props.onUpdateClient(editing.client.id, values)
            else await props.onCreateClient(values)
          }}
          onClose={close}
          deletion={editing.client && clientDeletion(editing.client)}
        />
      )}
      {editing?.kind === 'project' && (
        <ProjectForm
          client={editing.client}
          project={editing.project}
          onSubmit={async (values) => {
            if (editing.project) await props.onUpdateProject(editing.project.id, values)
            else await props.onCreateProject({ ...values, clientId: editing.client.id })
          }}
          onClose={close}
          deletion={
            editing.project && {
              allowed: !props.projectIdsWithTime.has(editing.project.id),
              question: `Delete "${editing.project.name}"?`,
              onDelete: async () => {
                await props.onDeleteProject(editing.project!.id)
                close()
              },
            }
          }
        />
      )}
    </section>
  )
}

interface ClientCardProps {
  client: Client
  projects: readonly Project[]
  runningProjectId: string | null
  favorites: readonly (string | null)[]
  onToggleTimer: (project: Project) => void
  onEdit: () => void
  onArchive: () => void
  onAddProject: () => void
  onEditProject: (project: Project) => void
  onArchiveProject: (project: Project) => void
}

function ClientCard({ client, projects, runningProjectId, favorites, ...on }: ClientCardProps) {
  return (
    <li className={styles.card} data-archived={client.archived || undefined}>
      <div className={styles.clientRow}>
        <Swatch color={client.color} />
        <span className={styles.clientName}>{client.name}</span>
        {client.archived && <span className={styles.tag}>Archived</span>}
        <span className={styles.meta}>{rateLabel(client.hourlyRateCents, client.currency)}</span>
        <span className={styles.actions}>
          <Button size="sm" variant="ghost" onClick={on.onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={on.onArchive}>
            {client.archived ? 'Unarchive' : 'Archive'}
          </Button>
        </span>
      </div>

      <ul className={styles.projects}>
        {projects.map((project) => (
          <li
            key={project.id}
            className={styles.projectRow}
            data-archived={project.archived || undefined}
            data-running={project.id === runningProjectId || undefined}
          >
            <TimerToggle
              project={project}
              running={project.id === runningProjectId}
              // Archived projects can't be started (but a running one can be stopped).
              disabled={(project.archived || client.archived) && project.id !== runningProjectId}
              onClick={() => on.onToggleTimer(project)}
            />
            <Swatch color={projectColor(project, client)} />
            <span className={styles.projectName}>{project.name}</span>
            <FavoriteBadge slot={favoriteSlot(favorites, project.id)} />
            {project.archived && <span className={styles.tag}>Archived</span>}
            {!project.billableByDefault && <span className={styles.tag}>Non-billable</span>}
            <span className={styles.meta}>
              {project.hourlyRateCents === null
                ? ''
                : rateLabel(project.hourlyRateCents, client.currency)}
            </span>
            <span className={styles.actions}>
              <Button size="sm" variant="ghost" onClick={() => on.onEditProject(project)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => on.onArchiveProject(project)}>
                {project.archived ? 'Unarchive' : 'Archive'}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {!client.archived && (
        <Button size="sm" variant="ghost" className={styles.addProject} onClick={on.onAddProject}>
          <Plus size={14} /> Add project
        </Button>
      )}
    </li>
  )
}

function TimerToggle(props: {
  project: Project
  running: boolean
  disabled: boolean
  onClick: () => void
}) {
  const label = props.running
    ? `Stop timer for ${props.project.name}`
    : `Start timer for ${props.project.name}`
  return (
    <Button
      size="sm"
      variant={props.running ? 'primary' : 'ghost'}
      className={styles.toggle}
      aria-label={label}
      title={label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.running ? (
        <Square size={12} fill="currentColor" />
      ) : (
        <Play size={12} fill="currentColor" />
      )}
    </Button>
  )
}

function FavoriteBadge({ slot }: { slot: number | null }) {
  if (slot === null) return null
  return (
    <span className={styles.favorite} title={`Favorite ${slot}`}>
      <Star size={12} fill="currentColor" aria-hidden />
      {slot}
    </span>
  )
}

function Swatch({ color }: { color: string }) {
  return <span className={styles.swatch} style={{ background: color }} aria-hidden />
}

function rateLabel(cents: number | null, currency: string): string {
  return cents === null ? 'No rate' : `${formatMoney(cents, currency)}/h`
}
