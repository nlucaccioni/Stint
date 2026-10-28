// SPDX-License-Identifier: GPL-3.0-or-later
// The Projects tab: one card per client, with its projects, their unbilled time,
// timers and budgets (SPEC.md §7). Receives data and callbacks as props, so
// desktop and (later) web can both use it.
import { useState, type CSSProperties } from 'react'
import {
  favoriteSlot,
  formatClock,
  formatMoney,
  projectSummaries,
  toHoursInput,
  type BudgetUsage,
  type Client,
  type ClientEdits,
  type ClientInput,
  type Project,
  type ProjectEdits,
  type ProjectInput,
  type ProjectSummary,
  type Session,
  type WeekStartDay,
} from '@stint/core'
import {
  ChevronUp,
  GripVertical,
  PanelTopClose,
  PanelTopOpen,
  Play,
  Plus,
  Search,
  Star,
  UserPlus,
} from 'lucide-react'
import { Button } from '../components/Button'
import { IconButton } from '../components/IconButton'
import { Menu } from '../components/Menu'
import { Tag } from '../components/Tag'
import { useNow } from '../timer/useNow'
import { useReorder } from './useReorder'
import { ClientForm } from './ClientForm'
import { ConfirmDelete, type DeleteTarget } from './ConfirmDelete'
import { ProjectForm } from './ProjectForm'
import styles from './ClientsView.module.css'

/** Suggested colors for new clients, cycled in order. All at full brightness, like every client color (see ColorPicker). */
const PALETTE = [
  '#58eeff',
  '#58ffa3',
  '#ffd058',
  '#ff7e58',
  '#aa8eff',
  '#ff77be',
  '#36ffe6',
  '#cde2ff',
]

export interface ClientsViewProps {
  clients: readonly Client[]
  projects: readonly Project[]
  /** Every non-deleted session: totals, budgets and delete checks come from these. */
  sessions: readonly Session[]
  defaultCurrency: string
  /** Project whose timer is running, if any. */
  runningProjectId: string | null
  /** Favorite slots (index 0 = slot 1); assigned in Settings. */
  favorites: readonly (string | null)[]
  /** For rolling budgets. */
  zone: string
  /** Default reset weekday for new weekly budgets. */
  weekStartsOn: WeekStartDay
  /** Clients whose cards are collapsed (remembered by the app). */
  collapsedClientIds: ReadonlySet<string>
  onToggleCollapsed: (clientId: string) => void
  /** Search button: opens the quick switcher. */
  onSearch: () => void
  /** The app's own screen color picker, if it has one (see ColorPicker). */
  pickScreenColor?: () => Promise<string | null>
  onToggleTimer: (projectId: string) => Promise<unknown>
  onCreateClient: (input: ClientInput) => Promise<unknown>
  onUpdateClient: (id: string, edits: ClientEdits) => Promise<unknown>
  onCreateProject: (input: ProjectInput) => Promise<unknown>
  onUpdateProject: (id: string, edits: ProjectEdits) => Promise<unknown>
  onDeleteClient: (id: string) => Promise<unknown>
  onDeleteProject: (id: string) => Promise<unknown>
  /** Reorder: put the item just before `beforeId` (null = at the end). */
  onMoveClient: (id: string, beforeId: string | null) => Promise<unknown>
  onMoveProject: (id: string, beforeId: string | null) => Promise<unknown>
}

type Editing =
  | { kind: 'client'; client?: Client }
  | { kind: 'project'; client: Client; project?: Project }
  | null

export function ClientsView(props: ClientsViewProps) {
  const { clients, projects } = props
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = useNow(props.runningProjectId !== null)

  const summaries = projectSummaries({
    sessions: props.sessions,
    projects,
    clients,
    now,
    zone: props.zone,
  })
  const hasArchived = clients.some((c) => c.archived) || projects.some((p) => p.archived)
  const visibleClients = clients.filter((c) => showArchived || !c.archived)
  const close = () => setEditing(null)
  const clientOrder = useReorder(
    'clients',
    visibleClients.map((c) => c.id),
    (id, beforeId) => act(props.onMoveClient(id, beforeId)),
  )

  /** For actions taken straight from the list (no form to show the error in). */
  function act(action: Promise<unknown>) {
    setError(null)
    action.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  function deleteTarget(name: string, kind: DeleteTarget['kind'], own: readonly Project[]) {
    const parts = own.map((p) => summaries.get(p.id)!)
    return {
      kind,
      name,
      projectCount: own.length,
      recordedMs: parts.reduce((n, s) => n + s.recordedMs, 0),
      sessionCount: parts.reduce((n, s) => n + s.sessionCount, 0),
      hasBilledTime: parts.some((s) => s.hasBilledTime),
    }
  }

  return (
    <section className={styles.projectsView}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Clients &amp; Projects</h1>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={props.onSearch}>
            Search <Search aria-hidden />
          </Button>
          <Button variant="primary" onClick={() => setEditing({ kind: 'client' })}>
            Add Client <UserPlus aria-hidden />
          </Button>
        </div>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {clients.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No clients yet. Add a client, then create projects to track time against.</p>
        </div>
      ) : (
        <ul className={styles.clientList}>
          {visibleClients.map((client) => {
            const all = projects.filter((p) => p.clientId === client.id)
            const shown = all.filter((p) => showArchived || !p.archived)
            return (
              <ClientCard
                key={client.id}
                client={client}
                projects={shown}
                summaries={summaries}
                reorder={clientOrder}
                onMoveProject={(id, beforeId) => act(props.onMoveProject(id, beforeId))}
                collapsed={props.collapsedClientIds.has(client.id)}
                onToggleCollapsed={() => props.onToggleCollapsed(client.id)}
                runningProjectId={props.runningProjectId}
                favorites={props.favorites}
                onToggleTimer={(project) => act(props.onToggleTimer(project.id))}
                onEdit={() => setEditing({ kind: 'client', client })}
                onArchive={() =>
                  act(props.onUpdateClient(client.id, { archived: !client.archived }))
                }
                onDelete={() =>
                  setDeleting({
                    ...deleteTarget(client.name, 'client', all),
                    onDelete: () => props.onDeleteClient(client.id),
                    onArchive: () => props.onUpdateClient(client.id, { archived: true }),
                  })
                }
                onAddProject={() => setEditing({ kind: 'project', client })}
                onEditProject={(project) => setEditing({ kind: 'project', client, project })}
                onArchiveProject={(project) =>
                  act(props.onUpdateProject(project.id, { archived: !project.archived }))
                }
                onDeleteProject={(project) =>
                  setDeleting({
                    ...deleteTarget(project.name, 'project', [project]),
                    onDelete: () => props.onDeleteProject(project.id),
                    onArchive: () => props.onUpdateProject(project.id, { archived: true }),
                  })
                }
              />
            )
          })}
        </ul>
      )}

      {hasArchived && (
        <div className={styles.archivedToggleRow}>
          <Button size="sm" variant="subtle" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? (
              <>
                Hide Archived <PanelTopClose aria-hidden />
              </>
            ) : (
              <>
                Show Archived <PanelTopOpen aria-hidden />
              </>
            )}
          </Button>
        </div>
      )}

      {editing?.kind === 'client' && (
        <ClientForm
          client={editing.client}
          defaultColor={PALETTE[clients.length % PALETTE.length]!}
          defaultCurrency={props.defaultCurrency}
          pickScreenColor={props.pickScreenColor}
          onSubmit={async (values) => {
            if (editing.client) await props.onUpdateClient(editing.client.id, values)
            else await props.onCreateClient(values)
          }}
          onClose={close}
        />
      )}
      {editing?.kind === 'project' && (
        <ProjectForm
          client={editing.client}
          project={editing.project}
          weekStartsOn={props.weekStartsOn}
          onSubmit={async (values) => {
            if (editing.project) await props.onUpdateProject(editing.project.id, values)
            else await props.onCreateProject({ ...values, clientId: editing.client.id })
          }}
          onClose={close}
        />
      )}
      {deleting && <ConfirmDelete target={deleting} onClose={() => setDeleting(null)} />}
    </section>
  )
}

interface ClientCardProps {
  client: Client
  projects: readonly Project[]
  summaries: ReadonlyMap<string, ProjectSummary>
  /** The client list's drag-to-reorder. */
  reorder: ReturnType<typeof useReorder>
  onMoveProject: (id: string, beforeId: string | null) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  runningProjectId: string | null
  favorites: readonly (string | null)[]
  onToggleTimer: (project: Project) => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onAddProject: () => void
  onEditProject: (project: Project) => void
  onArchiveProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
}

function ClientCard({ client, projects, summaries, reorder, collapsed, ...on }: ClientCardProps) {
  const running = projects.some((p) => p.id === on.runningProjectId)
  const projectOrder = useReorder(
    `projects:${client.id}`,
    projects.map((p) => p.id),
    on.onMoveProject,
  )
  const totalMs = projects.reduce((n, p) => n + (summaries.get(p.id)?.unbilledMs ?? 0), 0)
  return (
    <li
      className={styles.clientCard}
      data-collapsed={collapsed || undefined}
      data-archived={client.archived || undefined}
      data-running={running || undefined}
      style={{ '--client-color': client.color } as CSSProperties}
      {...reorder.itemProps(client.id)}
    >
      <span className={styles.colorBar} aria-hidden />
      <div className={styles.clientCardBody}>
        <div className={styles.clientBar}>
          <DragHandle
            label={`Drag to reorder ${client.name}`}
            {...reorder.handleProps(client.id)}
          />
          <div className={styles.nameGroup}>
            <span className={styles.clientName}>{client.name}</span>
          </div>
          <div className={styles.stats}>
            <span className={styles.rate}>
              {rateLabel(client.hourlyRateCents, client.currency)}
            </span>
            <Menu
              label={`Actions for ${client.name}`}
              items={[
                { label: 'Edit', onSelect: on.onEdit },
                ...reorder.menuItems(client.id),
                { label: client.archived ? 'Unarchive' : 'Archive', onSelect: on.onArchive },
                { label: 'Delete…', onSelect: on.onDelete, danger: true },
              ]}
            />
            <span className={styles.statsDivider} aria-hidden />
            <span className={styles.clientTotal}>
              <span className={styles.clientTotalLabel}>Total</span>
              <span className={styles.elapsed}>{formatClock(totalMs)}</span>
            </span>
            <IconButton
              label={collapsed ? `Show Projects for ${client.name}` : `Hide Projects`}
              aria-expanded={!collapsed}
              onClick={on.onToggleCollapsed}
            >
              <ChevronUp className={styles.chevron} aria-hidden />
            </IconButton>
          </div>
        </div>

        {/* Stays mounted so opening and closing can animate; `inert` keeps the hidden
            projects out of the tab order and away from screen readers. */}
        <div className={styles.collapsible} inert={collapsed}>
          <div className={styles.collapsibleInner}>
            <hr className={styles.clientBarRule} />
            {projects.length > 0 && (
              <ul className={styles.projectList}>
                {projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    client={client}
                    project={project}
                    summary={summaries.get(project.id)}
                    running={project.id === on.runningProjectId}
                    slot={favoriteSlot(on.favorites, project.id)}
                    reorder={projectOrder}
                    onToggleTimer={() => on.onToggleTimer(project)}
                    onEdit={() => on.onEditProject(project)}
                    onArchive={() => on.onArchiveProject(project)}
                    onDelete={() => on.onDeleteProject(project)}
                  />
                ))}
              </ul>
            )}
            {!client.archived && (
              <div className={styles.addProjectRow}>
                <Button size="sm" variant="tertiary" onClick={on.onAddProject}>
                  <Plus aria-hidden /> Add Project
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function ProjectRow(props: {
  client: Client
  project: Project
  summary: ProjectSummary | undefined
  running: boolean
  slot: number | null
  reorder: ReturnType<typeof useReorder>
  onToggleTimer: () => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const { client, project, summary, running } = props
  // Archived projects can't be started (but a running one can be stopped).
  const startable = !(project.archived || client.archived) || running
  const toggleLabel = `${running ? 'Stop' : 'Start'} timer for ${project.name}`
  return (
    <li
      className={styles.projectBar}
      data-archived={project.archived || undefined}
      data-capped={summary?.budget ? '' : undefined}
      {...props.reorder.itemProps(project.id)}
    >
      <DragHandle
        label={`Drag to reorder ${project.name}`}
        {...props.reorder.handleProps(project.id)}
      />
      {/* Name, with the budget bar under it when the project has one. */}
      <div className={styles.projectDetails}>
        <div className={styles.nameGroup}>
          <span className={styles.projectName}>{project.name}</span>
          {props.slot !== null && (
            <span className={styles.favoriteBadge} title={`Favorite ${props.slot}`}>
              <Star size={10} fill="currentColor" aria-hidden />
              {props.slot}
            </span>
          )}
          {!project.billableByDefault && <Tag>Non-Billable</Tag>}
        </div>
        {summary?.budget && <BudgetBar usage={summary.budget} currency={client.currency} />}
      </div>
      <div className={styles.stats}>
        {project.hourlyRateCents !== null && (
          <span className={styles.rate}>{rateLabel(project.hourlyRateCents, client.currency)}</span>
        )}
        <Menu
          label={`Actions for ${project.name}`}
          items={[
            { label: 'Edit', onSelect: props.onEdit },
            ...props.reorder.menuItems(project.id),
            { label: project.archived ? 'Unarchive' : 'Archive', onSelect: props.onArchive },
            { label: 'Delete…', onSelect: props.onDelete, danger: true },
          ]}
        />
        <span className={styles.statsDivider} aria-hidden />
        {/* Unbilled billable time; a non-billable project is never billed, so it
            shows all its recorded time instead (not part of the client total). */}
        <span className={styles.elapsed}>
          {formatClock(
            (project.billableByDefault ? summary?.unbilledMs : summary?.recordedMs) ?? 0,
          )}
        </span>
        <button
          type="button"
          className={styles.startStop}
          data-running={running || undefined}
          aria-label={toggleLabel}
          title={toggleLabel}
          disabled={!startable}
          onClick={props.onToggleTimer}
        >
          {running ? (
            <span className={styles.stopIcon} aria-hidden />
          ) : (
            <Play size={14} fill="currentColor" aria-hidden />
          )}
        </button>
      </div>
    </li>
  )
}

function BudgetBar({ usage, currency }: { usage: BudgetUsage; currency: string }) {
  const { budget, fraction } = usage
  const amount =
    budget.unit === 'minutes'
      ? `${toHoursInput(budget.amount)}hr`
      : formatMoney(budget.amount, currency)
  const kind =
    budget.period === 'week'
      ? 'weekly budget'
      : budget.period === 'month'
        ? 'monthly budget'
        : 'budget'
  const over = fraction !== null && fraction >= 1
  const label =
    fraction === null
      ? `No rate for the ${amount} ${kind}`
      : `${Math.round(fraction * 100)}% of ${amount} ${kind}`
  return (
    <div className={styles.budget} data-over={over || undefined}>
      <div
        className={styles.budgetTrack}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      >
        <div
          className={styles.budgetFill}
          style={{ width: `${Math.min(1, fraction ?? 0) * 100}%` }}
        />
      </div>
      <span className={styles.budgetLabel}>{label}</span>
    </div>
  )
}

/**
 * The grip that starts a drag. Shown on hover; from the keyboard, Move Up and
 * Move Down in the ⋯ menu do the same thing.
 */
function DragHandle({
  label,
  ...drag
}: { label: string } & ReturnType<ReturnType<typeof useReorder>['handleProps']>) {
  return (
    <span className={styles.dragHandle} title={label} aria-hidden {...drag}>
      <GripVertical />
    </span>
  )
}

function rateLabel(cents: number | null, currency: string): string {
  return cents === null ? 'No Rate' : `${formatMoney(cents, currency)}/hr`
}
