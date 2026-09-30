// SPDX-License-Identifier: GPL-3.0-or-later
// The contract between the renderer (React UI) and the main process.
//
// - StintApi is what UI code calls, via `api` in the renderer.
// - Each method is one IPC channel, `stint:<method>`. Only the methods listed in
//   `apiMethods` exist; the renderer can do nothing that isn't listed here.
// - Across IPC, results travel as ApiResult so error codes survive the trip;
//   the renderer's `api` wrapper turns failures back into thrown ApiErrors.
import type {
  Client,
  ClientEdits,
  ClientInput,
  Project,
  ProjectEdits,
  ProjectInput,
} from '@stint/core'

export interface AppInfo {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
}

export interface StintApi {
  getAppInfo(): Promise<AppInfo>
  listClients(): Promise<Client[]>
  createClient(input: ClientInput): Promise<Client>
  updateClient(id: string, edits: ClientEdits): Promise<Client>
  listProjects(): Promise<Project[]>
  createProject(input: ProjectInput): Promise<Project>
  updateProject(id: string, edits: ProjectEdits): Promise<Project>
}

export const apiMethods = [
  'getAppInfo',
  'listClients',
  'createClient',
  'updateClient',
  'listProjects',
  'createProject',
  'updateProject',
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

/** What the preload script exposes as `window.stintBridge`. */
export type BridgeApi = {
  [K in ApiMethod]: (
    ...args: Parameters<StintApi[K]>
  ) => Promise<ApiResult<Awaited<ReturnType<StintApi[K]>>>>
}
