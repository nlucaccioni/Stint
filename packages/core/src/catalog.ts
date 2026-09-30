// SPDX-License-Identifier: GPL-3.0-or-later
// Creating and editing clients and projects. Each function validates, then returns
// a complete record (new) or the fields to change (edit), stamped with sync fields.
import { newId as defaultNewId } from './ids'
import type { ChangeContext } from './changes'
import { StintError } from './errors'
import { isSupportedCurrency } from './money'
import type { Client, Project } from './types'

export interface ClientInput {
  name: string
  color: string
  hourlyRateCents: number | null
  currency: string
}

export type ClientEdits = Partial<ClientInput & { archived: boolean }>

export interface ProjectInput {
  clientId: string
  name: string
  /** null = use the client's color. */
  color: string | null
  /** null = use the client's rate. */
  hourlyRateCents: number | null
  billableByDefault: boolean
}

export type ProjectEdits = Partial<Omit<ProjectInput, 'clientId'> & { archived: boolean }>

const MAX_NAME = 100
const MAX_RATE_CENTS = 100_000_000 // $1,000,000/h: anything above is a typo

export function newClient(input: ClientInput, ctx: ChangeContext): Client {
  return {
    ...syncFields(ctx),
    name: validName(input.name),
    color: validColor(input.color),
    hourlyRateCents: validRate(input.hourlyRateCents),
    currency: validCurrency(input.currency),
    archived: false,
  }
}

export function clientPatch(edits: ClientEdits, ctx: ChangeContext): Partial<Client> {
  const patch: Partial<Client> = { updatedAt: ctx.now, deviceId: ctx.deviceId }
  if (edits.name !== undefined) patch.name = validName(edits.name)
  if (edits.color !== undefined) patch.color = validColor(edits.color)
  if (edits.hourlyRateCents !== undefined) patch.hourlyRateCents = validRate(edits.hourlyRateCents)
  if (edits.currency !== undefined) patch.currency = validCurrency(edits.currency)
  if (edits.archived !== undefined) patch.archived = edits.archived
  return patch
}

export function newProject(input: ProjectInput, ctx: ChangeContext): Project {
  return {
    ...syncFields(ctx),
    clientId: input.clientId,
    name: validName(input.name),
    color: input.color === null ? null : validColor(input.color),
    hourlyRateCents: validRate(input.hourlyRateCents),
    billableByDefault: input.billableByDefault,
    archived: false,
  }
}

export function projectPatch(edits: ProjectEdits, ctx: ChangeContext): Partial<Project> {
  const patch: Partial<Project> = { updatedAt: ctx.now, deviceId: ctx.deviceId }
  if (edits.name !== undefined) patch.name = validName(edits.name)
  if (edits.color !== undefined) patch.color = edits.color === null ? null : validColor(edits.color)
  if (edits.hourlyRateCents !== undefined) patch.hourlyRateCents = validRate(edits.hourlyRateCents)
  if (edits.billableByDefault !== undefined) patch.billableByDefault = edits.billableByDefault
  if (edits.archived !== undefined) patch.archived = edits.archived
  return patch
}

/** A project's display color: its own, or its client's. */
export function projectColor(project: Pick<Project, 'color'>, client: Pick<Client, 'color'>) {
  return project.color ?? client.color
}

function syncFields(ctx: ChangeContext) {
  return {
    id: (ctx.newId ?? defaultNewId)(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deviceId: ctx.deviceId,
    deletedAt: null,
  }
}

function validName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new StintError('invalid-name', 'Name is required.')
  if (trimmed.length > MAX_NAME) {
    throw new StintError('invalid-name', `Name must be ${MAX_NAME} characters or fewer.`)
  }
  return trimmed
}

function validColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new StintError('invalid-color', 'Color must be a hex value like #3366cc.')
  }
  return color.toLowerCase()
}

function validRate(cents: number | null): number | null {
  if (cents === null) return null
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_RATE_CENTS) {
    throw new StintError('invalid-rate', 'Rate must be a positive amount.')
  }
  return cents
}

function validCurrency(code: string): string {
  if (!isSupportedCurrency(code)) {
    throw new StintError('invalid-currency', `${code} isn't a supported currency code.`)
  }
  return code
}
