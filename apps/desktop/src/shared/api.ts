// SPDX-License-Identifier: GPL-3.0-or-later
// The contract between the renderer (React UI) and the main process.
//
// - StintApi is what UI code calls, via `api` in the renderer.
// - Each method is one IPC channel, `stint:<method>`. Only the methods listed in
//   `apiMethods` exist; the renderer can do nothing that isn't listed here.
// - Across IPC, results travel as ApiResult so error codes survive the trip;
//   the renderer's `api` wrapper turns failures back into thrown ApiErrors.
// - Main can also push events (StintEvents) to the renderer, e.g. when the timer
//   changes from somewhere other than the window (tray, hotkeys, Keypad).
import type {
  Client,
  ClientEdits,
  ClientInput,
  Project,
  ProjectEdits,
  ProjectInput,
  Session,
  SessionEdits,
  TimeRange,
} from '@stint/core'

/** A manual time entry. */
export interface SessionInput {
  projectId: string
  startedAt: number
  endedAt: number
  note: string
  billable: boolean
}

/** Time to check for overlaps. Pass `id` when editing so a session doesn't overlap itself. */
export interface OverlapQuery {
  id?: string
  startedAt: number
  endedAt: number | null
}

export interface AppInfo {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
}

export interface TimerState {
  /** The running session, or null when no timer is running. */
  running: Session | null
}

export interface StintApi {
  getAppInfo(): Promise<AppInfo>
  listClients(): Promise<Client[]>
  createClient(input: ClientInput): Promise<Client>
  updateClient(id: string, edits: ClientEdits): Promise<Client>
  listProjects(): Promise<Project[]>
  createProject(input: ProjectInput): Promise<Project>
  updateProject(id: string, edits: ProjectEdits): Promise<Project>
  /** Projects that have recorded time (and so can't be deleted). */
  listProjectIdsWithTime(): Promise<string[]>
  /** Only allowed when the project has no recorded time. */
  deleteProject(id: string): Promise<void>
  /** Only allowed when none of the client's projects have recorded time. */
  deleteClient(id: string): Promise<void>

  getTimerState(): Promise<TimerState>
  /** Start/switch to a project, or stop it if it's the one running. */
  toggleTimer(projectId: string): Promise<TimerState>
  /** Start/switch to a project; does nothing if it's already running. */
  startTimer(projectId: string): Promise<TimerState>
  stopTimer(): Promise<TimerState>
  /** End the running timer at an earlier time (epoch ms). */
  stopTimerAt(at: number): Promise<TimerState>

  /** Sessions overlapping `range`, oldest first. */
  listSessions(range: TimeRange): Promise<Session[]>
  /** Other sessions sharing time with the given span (allowed, but worth a warning). */
  findOverlaps(query: OverlapQuery): Promise<Session[]>
  createSession(input: SessionInput): Promise<Session>
  updateSession(id: string, edits: SessionEdits): Promise<Session>
  /** Split a session in two at `at` (epoch ms). */
  splitSession(id: string, at: number): Promise<void>
  deleteSession(id: string): Promise<void>
}

export const apiMethods = [
  'getAppInfo',
  'listClients',
  'createClient',
  'updateClient',
  'listProjects',
  'createProject',
  'updateProject',
  'listProjectIdsWithTime',
  'deleteProject',
  'deleteClient',
  'getTimerState',
  'toggleTimer',
  'startTimer',
  'stopTimer',
  'stopTimerAt',
  'listSessions',
  'findOverlaps',
  'createSession',
  'updateSession',
  'splitSession',
  'deleteSession',
] as const satisfies readonly (keyof StintApi)[]

// Compile-time check that apiMethods lists every StintApi method.
type Unlisted = Exclude<keyof StintApi, (typeof apiMethods)[number]>
const _allListed: Unlisted extends never ? true : Unlisted = true
void _allListed

export type ApiMethod = keyof StintApi

export function channel(method: ApiMethod): string {
  return `stint:${method}`
}

export interface ApiErrorInfo {
  /** A core StintErrorCode, 'invalid-input' (bad arguments), or 'internal' (a bug). */
  code: string
  message: string
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiErrorInfo }

/** Events main pushes to the renderer, and their payloads. */
export interface StintEvents {
  /** The running timer started, stopped, switched, or was edited. */
  timerChanged: TimerState
  /** Any session was added, edited, or deleted (including by the timer). */
  sessionsChanged: null
}

export const eventNames = [
  'timerChanged',
  'sessionsChanged',
] as const satisfies readonly (keyof StintEvents)[]

export type EventName = keyof StintEvents

export function eventChannel(name: EventName): string {
  return `stint:event:${name}`
}

export type Unsubscribe = () => void

/** What the preload script exposes as `window.stintBridge`. */
export type BridgeApi = {
  [K in ApiMethod]: (
    ...args: Parameters<StintApi[K]>
  ) => Promise<ApiResult<Awaited<ReturnType<StintApi[K]>>>>
} & {
  on<E extends EventName>(event: E, listener: (payload: StintEvents[E]) => void): Unsubscribe
}
