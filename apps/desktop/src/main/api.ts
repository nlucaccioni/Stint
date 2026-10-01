// SPDX-License-Identifier: GPL-3.0-or-later
// Implementations of every StintApi method. Arguments arrive from the renderer,
// so they're treated as untrusted: zod checks their shape first, then core
// checks the business rules. These are plain functions (no Electron), so they can
// be tested directly against an in-memory database.
import { z } from 'zod'
import {
  clientPatch,
  createManualSession,
  deleteSession,
  editSession,
  findOverlaps,
  newClient,
  newProject,
  projectPatch,
  resolveIdle,
  sessionsToCsv,
  splitSession,
  start,
  stop,
  stopAt,
  StintError,
  toLocalParts,
  validatePreferences,
  withoutFavorites,
  toggle,
  type ChangeContext,
  type Preferences,
  type Project,
  type SessionChange,
} from '@stint/core'
import type { AppInfo, ApiMethod, IdleAway, StintApi, TimerState } from '../shared/api'
import { transaction, type Db } from './db/connection'
import { getClient, insertClient, listClients, updateClient } from './db/clients'
import { getPreferences, setPreferences } from './db/preferences'
import { getProject, insertProject, listProjects, updateProject } from './db/projects'
import {
  applySessionChanges,
  getRunningSession,
  getSession,
  listSessions,
  projectIdsWithTime,
} from './db/sessions'

export interface ApiDeps {
  db: Db
  deviceId: string
  appInfo: AppInfo
  /** Injectable clock for tests. */
  now?: () => number
  /** Called after any change to the running timer, so every window can update. */
  onTimerChanged?: (state: TimerState) => void
  /** Called after any session is added, edited, or deleted. */
  onSessionsChanged?: () => void
  onPreferencesChanged?: (prefs: Preferences) => void
  /**
   * Ask the user where to save a file (system dialog) and write it there.
   * Returns the chosen path, or null if they cancelled.
   */
  saveFile?: (suggestedName: string, contents: string) => Promise<string | null>
  /** Reveal a file in Finder / Explorer. */
  revealFile?: (path: string) => void
  /** The absence waiting for a decision, owned by the idle watcher in main. */
  pendingIdle?: { get: () => IdleAway | null; clear: () => void }
}

/** Handlers that wait on something outside Stint (e.g. a save dialog). */
type AsyncMethod = 'exportCsv'

/**
 * Each handler takes raw arguments and returns the value (or throws). Most are
 * synchronous, since SQLite calls are; the few that wait return a promise.
 */
export type ApiHandlers = {
  [K in ApiMethod]: (
    ...args: unknown[]
  ) => K extends AsyncMethod ? ReturnType<StintApi[K]> : Awaited<ReturnType<StintApi[K]>>
}

const id = z.string().min(1).max(100)
const name = z.string().max(1000)
const color = z.string().max(20)
const rate = z.number().nullable()

const clientInput = z.strictObject({ name, color, hourlyRateCents: rate, currency: z.string() })
const clientEdits = z.strictObject({
  name: name.optional(),
  color: color.optional(),
  hourlyRateCents: rate.optional(),
  currency: z.string().optional(),
  archived: z.boolean().optional(),
})
const projectInput = z.strictObject({
  clientId: id,
  name,
  color: color.nullable(),
  hourlyRateCents: rate,
  billableByDefault: z.boolean(),
})
const time = z.number().int().nonnegative()
const note = z.string().max(10_000)
const sessionInput = z.strictObject({
  projectId: id,
  startedAt: time,
  endedAt: time,
  note,
  billable: z.boolean(),
})
const sessionEdits = z.strictObject({
  projectId: id.optional(),
  startedAt: time.optional(),
  endedAt: time.optional(),
  note: note.optional(),
  billable: z.boolean().optional(),
})
const overlapQuery = z.strictObject({
  id: id.optional(),
  startedAt: time,
  endedAt: time.nullable(),
})
const timeRange = z.strictObject({ start: time, end: time })
const preferenceEdits = z.strictObject({
  idleMinutes: z.number().optional(),
  nudgeHours: z.number().optional(),
  weekStartsOn: z.number().optional(),
  defaultCurrency: z.string().max(3).optional(),
  favorites: z.array(id.nullable()).max(20).optional(),
})
const timeZone = z.string().refine(isTimeZone, 'Unknown time zone')

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const projectEdits = z.strictObject({
  name: name.optional(),
  color: color.nullable().optional(),
  hourlyRateCents: rate.optional(),
  billableByDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
})

export function createApiHandlers(deps: ApiDeps): ApiHandlers {
  const { db } = deps
  // Only the file Stint itself just exported can be revealed, never a path from the UI.
  let lastExportPath: string | null = null
  const ctx = (): ChangeContext => ({ now: (deps.now ?? Date.now)(), deviceId: deps.deviceId })

  function savePreferences(values: Partial<Preferences>): Preferences {
    setPreferences(db, values, ctx())
    const prefs = getPreferences(db)
    deps.onPreferencesChanged?.(prefs)
    return prefs
  }

  /** Deleted projects can't stay in favorite slots. */
  function dropFavorites(projectIds: string[]): void {
    const { favorites } = getPreferences(db)
    const next = withoutFavorites(favorites, projectIds)
    if (next.some((id, i) => id !== favorites[i])) savePreferences({ favorites: next })
  }

  function stamp() {
    const { now, deviceId } = ctx()
    return { updatedAt: now, deviceId }
  }

  function timerState(): TimerState {
    return { running: getRunningSession(db) }
  }

  /**
   * Read the running timer, decide what changes (core), and save them, all inside
   * one transaction so nothing can change in between. Then tell listeners: every
   * change is a sessions change, and a timer change if the running session differs.
   */
  function changeSessions(
    decide: (running: TimerState['running']) => SessionChange[],
  ): SessionChange[] {
    let before: TimerState['running'] = null
    const changes = transaction(db, () => {
      before = getRunningSession(db)
      const changes = decide(before)
      applySessionChanges(db, changes)
      return changes
    })
    if (changes.length > 0) {
      deps.onSessionsChanged?.()
      const state = timerState()
      if (JSON.stringify(state.running) !== JSON.stringify(before)) deps.onTimerChanged?.(state)
    }
    return changes
  }

  function changeTimer(decide: (running: TimerState['running']) => SessionChange[]): TimerState {
    changeSessions(decide)
    return timerState()
  }

  function existingSession(sessionId: string) {
    const session = getSession(db, sessionId)
    if (!session || session.deletedAt !== null) {
      throw new StintError('not-found', 'Session not found.')
    }
    return session
  }

  /** Archived projects (or projects of archived clients) can't be started. */
  function assertStartable(project: Project): void {
    const client = existingClient(project.clientId)
    if (project.archived || client.archived) {
      throw new StintError('archived', 'Unarchive this project to track time on it.')
    }
  }

  function existingClient(clientId: string) {
    const client = getClient(db, clientId)
    if (!client || client.deletedAt !== null) throw new StintError('not-found', 'Client not found.')
    return client
  }

  function existingProject(projectId: string) {
    const project = getProject(db, projectId)
    if (!project || project.deletedAt !== null) {
      throw new StintError('not-found', 'Project not found.')
    }
    return project
  }

  return {
    getAppInfo: () => deps.appInfo,

    listClients: () => listClients(db),

    createClient: (...args) => {
      const [input] = z.tuple([clientInput]).parse(args)
      const client = newClient(input, ctx())
      insertClient(db, client)
      return client
    },

    updateClient: (...args) => {
      const [clientId, edits] = z.tuple([id, clientEdits]).parse(args)
      existingClient(clientId)
      updateClient(db, clientId, clientPatch(edits, ctx()))
      return existingClient(clientId)
    },

    listProjects: () => listProjects(db),

    createProject: (...args) => {
      const [input] = z.tuple([projectInput]).parse(args)
      existingClient(input.clientId)
      const project = newProject(input, ctx())
      insertProject(db, project)
      return project
    },

    updateProject: (...args) => {
      const [projectId, edits] = z.tuple([id, projectEdits]).parse(args)
      existingProject(projectId)
      updateProject(db, projectId, projectPatch(edits, ctx()))
      return existingProject(projectId)
    },

    listProjectIdsWithTime: () => projectIdsWithTime(db),

    getTimerState: () => timerState(),

    toggleTimer: (...args) => {
      const [projectId] = z.tuple([id]).parse(args)
      const project = existingProject(projectId)
      return changeTimer((running) => {
        // Stopping is always allowed, even if the project was archived while running.
        if (running?.projectId !== project.id) assertStartable(project)
        return toggle(running, project, ctx())
      })
    },

    startTimer: (...args) => {
      const [projectId] = z.tuple([id]).parse(args)
      const project = existingProject(projectId)
      return changeTimer((running) => {
        if (running?.projectId !== project.id) assertStartable(project)
        return start(running, project, ctx())
      })
    },

    stopTimer: (...args) => {
      z.tuple([]).parse(args)
      return changeTimer((running) => stop(running, ctx()))
    },

    stopTimerAt: (...args) => {
      const [at] = z.tuple([z.number().int()]).parse(args)
      return changeTimer((running) => stopAt(running, at, ctx()))
    },

    listSessions: (...args) => {
      const [range] = z.tuple([timeRange]).parse(args)
      return listSessions(db, range)
    },

    findOverlaps: (...args) => {
      const [query] = z.tuple([overlapQuery]).parse(args)
      const now = ctx().now
      const nearby = listSessions(db, { start: query.startedAt, end: query.endedAt ?? now })
      return findOverlaps(query, nearby, now)
    },

    createSession: (...args) => {
      const [input] = z.tuple([sessionInput]).parse(args)
      assertStartable(existingProject(input.projectId))
      const change = createManualSession(input, ctx())
      changeSessions(() => [change])
      return existingSession(change.kind === 'insert' ? change.session.id : change.id)
    },

    updateSession: (...args) => {
      const [sessionId, edits] = z.tuple([id, sessionEdits]).parse(args)
      const session = existingSession(sessionId)
      // Moving time onto an archived project isn't allowed (same rule as starting one).
      if (edits.projectId !== undefined && edits.projectId !== session.projectId) {
        assertStartable(existingProject(edits.projectId))
      }
      changeSessions(() => [editSession(existingSession(sessionId), edits, ctx())])
      return existingSession(sessionId)
    },

    splitSession: (...args) => {
      const [sessionId, at] = z.tuple([id, time]).parse(args)
      changeSessions(() => splitSession(existingSession(sessionId), at, ctx()))
    },

    deleteSession: (...args) => {
      const [sessionId] = z.tuple([id]).parse(args)
      changeSessions(() => [deleteSession(existingSession(sessionId), ctx())])
    },

    exportCsv: async (...args) => {
      const [range, zone] = z.tuple([timeRange, timeZone]).parse(args)
      if (!deps.saveFile) throw new Error('Saving files is not available.')
      const sessions = listSessions(db, range)
      const csv = sessionsToCsv({
        sessions,
        projects: listProjects(db),
        clients: listClients(db),
        batches: [], // billing batches arrive in Phase 3
        zone,
        now: ctx().now,
      })
      const first = toLocalParts(range.start, zone).date
      const last = toLocalParts(range.end - 1, zone).date
      const name = first === last ? `stint-${first}.csv` : `stint-${first}-to-${last}.csv`
      // The BOM tells Excel the file is UTF-8, so names like "Café" and "€" show correctly.
      const path = await deps.saveFile(name, '\uFEFF' + csv)
      if (path === null) return { saved: false, count: 0 }
      lastExportPath = path
      return { saved: true, count: sessions.length }
    },

    getPreferences: () => getPreferences(db),

    updatePreferences: (...args) => {
      const [edits] = z.tuple([preferenceEdits]).parse(args)
      const valid = validatePreferences(edits as Partial<Preferences>)
      for (const projectId of valid.favorites ?? []) if (projectId) existingProject(projectId)
      return savePreferences(valid)
    },

    getPendingIdle: () => deps.pendingIdle?.get() ?? null,

    resolveIdle: (...args) => {
      const [choice] = z.tuple([z.enum(['keep', 'discard', 'discard-continue'])]).parse(args)
      const pending = deps.pendingIdle?.get() ?? null
      deps.pendingIdle?.clear()
      if (!pending) return timerState()
      return changeTimer((running) =>
        // Only apply to the session that was running when the user went away.
        running?.id === pending.sessionId
          ? resolveIdle(running, pending.idleStartedAt, choice, ctx())
          : [],
      )
    },

    showExportedFile: (...args) => {
      z.tuple([]).parse(args)
      if (lastExportPath) deps.revealFile?.(lastExportPath)
    },

    // Deleting is only for mistakes: anything with recorded time must be archived
    // instead, so no time is ever left pointing at a missing project.
    deleteProject: (...args) => {
      const [projectId] = z.tuple([id]).parse(args)
      existingProject(projectId)
      transaction(db, () => {
        if (projectIdsWithTime(db).includes(projectId)) throw hasTime('project')
        updateProject(db, projectId, { deletedAt: ctx().now, ...stamp() })
        dropFavorites([projectId])
      })
    },

    /** Also deletes the client's projects, which must all be empty. */
    deleteClient: (...args) => {
      const [clientId] = z.tuple([id]).parse(args)
      existingClient(clientId)
      transaction(db, () => {
        const withTime = new Set(projectIdsWithTime(db))
        const projects = listProjects(db).filter((p) => p.clientId === clientId)
        if (projects.some((p) => withTime.has(p.id))) throw hasTime('client')
        const now = ctx().now
        for (const p of projects) updateProject(db, p.id, { deletedAt: now, ...stamp() })
        updateClient(db, clientId, { deletedAt: now, ...stamp() })
        dropFavorites(projects.map((p) => p.id))
      })
    },
  }
}

function hasTime(kind: 'client' | 'project'): StintError {
  return new StintError(
    'has-recorded-time',
    `This ${kind} has recorded time, so it can't be deleted. Archive it instead.`,
  )
}
