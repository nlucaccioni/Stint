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
  BatchEdits,
  BillingBatch,
  Client,
  ClientEdits,
  IdleChoice,
  Preferences,
  ClientInput,
  Project,
  ProjectEdits,
  ProjectInput,
  Session,
  SessionEdits,
  TimeRange,
} from '@stint/core'

import type { HotkeyAction, HotkeyBindings } from './hotkeys'

export interface HotkeyStatus {
  ok: boolean
  /** in-use: another app owns it. duplicate: another Stint action uses it. invalid: not a usable shortcut. */
  problem?: 'in-use' | 'duplicate' | 'invalid'
}

export interface HotkeyState {
  bindings: HotkeyBindings
  defaults: HotkeyBindings
  status: Record<HotkeyAction, HotkeyStatus>
  /** True while the settings screen is recording a new shortcut. */
  paused: boolean
}

export type AppView = 'projects' | 'time' | 'totals' | 'billing' | 'settings'

export interface LaunchAtLogin {
  enabled: boolean
  /** False in development builds (it would register the dev Electron binary). */
  available: boolean
}

export interface NewBatch {
  clientId: string
  rangeStart: number
  rangeEnd: number
  sessionIds: string[]
  reference: string
  billedAt: number
  note: string
}

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

/** Time the user was away while a timer ran (see main/idle.ts). */
export interface IdleAway {
  sessionId: string
  idleStartedAt: number
  returnedAt: number
}

export interface ExportResult {
  /** False if the user cancelled the save dialog. */
  saved: boolean
  /** Number of sessions written. */
  count: number
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

  /** Ask where to save, then write a CSV of the sessions overlapping `range`. */
  exportCsv(range: TimeRange, zone: string): Promise<ExportResult>
  /** Show the most recently exported file in Finder / Explorer. */
  showExportedFile(): Promise<void>

  getPreferences(): Promise<Preferences>
  updatePreferences(edits: Partial<Preferences>): Promise<Preferences>

  /** An absence waiting for the user's decision, if any. */
  getPendingIdle(): Promise<IdleAway | null>
  /** Keep, discard, or discard-and-continue the pending idle time. */
  resolveIdle(choice: IdleChoice): Promise<TimerState>

  /** Global shortcuts on this device, and whether each one registered. */
  getHotkeys(): Promise<HotkeyState>
  /** Change one shortcut (null = none). */
  setHotkey(action: HotkeyAction, accelerator: string | null): Promise<HotkeyState>
  resetHotkeys(): Promise<HotkeyState>
  /** Release all shortcuts while recording a new one (so pressing it isn't swallowed). */
  pauseHotkeys(paused: boolean): Promise<HotkeyState>

  getLaunchAtLogin(): Promise<LaunchAtLogin>
  setLaunchAtLogin(enabled: boolean): Promise<LaunchAtLogin>

  /** Projects with the most recent time, newest first (for the quick switcher). */
  listRecentProjectIds(limit: number): Promise<string[]>
  /** Close the quick switcher (after a pick or Esc). */
  hideSwitcher(): Promise<void>
  /** Open the app menu (File, Edit, View, Window) at a point in the window. Windows/Linux. */
  showAppMenu(x: number, y: number): Promise<void>
  /** Color the window buttons drawn by Windows/Linux to match the title bar. */
  setTitleBarColors(background: string, symbols: string): Promise<void>

  /** All billing batches, most recently billed first. */
  listBatches(): Promise<BillingBatch[]>
  listBatchSessions(batchId: string): Promise<Session[]>
  /** Every unbilled, billable, finished session (for the Billing tab). */
  listUnbilledSessions(): Promise<Session[]>
  /** Every session in any batch (for batch hours and amounts). */
  listBilledSessions(): Promise<Session[]>
  createBatch(input: NewBatch): Promise<BillingBatch>
  /** Edit reference/note/billed date, or mark paid (date) / unpaid (null). */
  updateBatch(id: string, edits: BatchEdits): Promise<BillingBatch>
  /** Add forgotten sessions to an unpaid batch. */
  addToBatch(id: string, sessionIds: string[]): Promise<BillingBatch>
  /** Take one session out of its batch so it can be edited. */
  unlockSession(sessionId: string): Promise<Session>
  /** Release every session and delete the batch (unpaid batches only). */
  unbillBatch(id: string): Promise<void>
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
  'exportCsv',
  'showExportedFile',
  'getPreferences',
  'updatePreferences',
  'getPendingIdle',
  'resolveIdle',
  'getHotkeys',
  'setHotkey',
  'resetHotkeys',
  'pauseHotkeys',
  'getLaunchAtLogin',
  'setLaunchAtLogin',
  'listRecentProjectIds',
  'hideSwitcher',
  'showAppMenu',
  'setTitleBarColors',
  'listBatches',
  'listBatchSessions',
  'listUnbilledSessions',
  'listBilledSessions',
  'createBatch',
  'updateBatch',
  'addToBatch',
  'unlockSession',
  'unbillBatch',
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
  preferencesChanged: Preferences
  /** An absence needs a decision (or null: it was resolved or no longer applies). */
  idleChanged: IdleAway | null
  /** Show a particular tab (e.g. "Settings…" chosen in the tray menu). */
  navigate: AppView
  /** The quick switcher was opened: reset the search and refresh. */
  switcherShown: null
  /** A billing batch was created, edited, or removed. */
  batchesChanged: null
}

export const eventNames = [
  'timerChanged',
  'sessionsChanged',
  'preferencesChanged',
  'idleChanged',
  'navigate',
  'switcherShown',
  'batchesChanged',
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
