// SPDX-License-Identifier: GPL-3.0-or-later
// Implementations of every StintApi method. Arguments arrive from the renderer,
// so they're treated as untrusted: zod checks their shape first, then core
// checks the business rules. These are plain functions (no Electron), so they can
// be tested directly against an in-memory database.
import { z } from 'zod'
import {
  clientPatch,
  newClient,
  newProject,
  projectPatch,
  StintError,
  type ChangeContext,
} from '@stint/core'
import type { AppInfo, ApiMethod, StintApi } from '../shared/api'
import type { Db } from './db/connection'
import { getClient, insertClient, listClients, updateClient } from './db/clients'
import { getProject, insertProject, listProjects, updateProject } from './db/projects'

export interface ApiDeps {
  db: Db
  deviceId: string
  appInfo: AppInfo
  /** Injectable clock for tests. */
  now?: () => number
}

/** Each handler takes raw arguments and returns the unwrapped value (or throws). */
export type ApiHandlers = {
  [K in ApiMethod]: (...args: unknown[]) => Awaited<ReturnType<StintApi[K]>>
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
const projectEdits = z.strictObject({
  name: name.optional(),
  color: color.nullable().optional(),
  hourlyRateCents: rate.optional(),
  billableByDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
})

export function createApiHandlers(deps: ApiDeps): ApiHandlers {
  const { db } = deps
  const ctx = (): ChangeContext => ({ now: (deps.now ?? Date.now)(), deviceId: deps.deviceId })

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
  }
}
