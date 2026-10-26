// SPDX-License-Identifier: GPL-3.0-or-later
// Creating and editing clients and projects. Each function validates, then returns
// a complete record (new) or the fields to change (edit), stamped with sync fields.
import { budgetFields, type Budget } from './budget'
import { newId as defaultNewId } from './ids'
import { keyBetween } from './order'
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
  /** null = use the client's rate. */
  hourlyRateCents: number | null
  billableByDefault: boolean
  /** null or omitted = no budget. */
  budget?: Budget | null
}

export type ProjectEdits = Partial<Omit<ProjectInput, 'clientId'> & { archived: boolean }>

const MAX_NAME = 100
const MAX_RATE_CENTS = 100_000_000 // $1,000,000/h: anything above is a typo

/** `sortKey` places it in the list; the API passes one after the last client. */
export function newClient(
  input: ClientInput,
  ctx: ChangeContext,
  sortKey = keyBetween(null, null),
): Client {
  return {
    ...syncFields(ctx),
    name: validName(input.name),
    sortKey,
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

/** `sortKey` places it among the client's projects; the API passes one after the last. */
export function newProject(
  input: ProjectInput,
  ctx: ChangeContext,
  sortKey = keyBetween(null, null),
): Project {
  return {
    ...syncFields(ctx),
    clientId: input.clientId,
    name: validName(input.name),
    sortKey,
    hourlyRateCents: validRate(input.hourlyRateCents),
    billableByDefault: input.billableByDefault,
    archived: false,
    ...budgetFields(input.budget ?? null),
  }
}

export function projectPatch(edits: ProjectEdits, ctx: ChangeContext): Partial<Project> {
  const patch: Partial<Project> = { updatedAt: ctx.now, deviceId: ctx.deviceId }
  if (edits.name !== undefined) patch.name = validName(edits.name)
  if (edits.hourlyRateCents !== undefined) patch.hourlyRateCents = validRate(edits.hourlyRateCents)
  if (edits.billableByDefault !== undefined) patch.billableByDefault = edits.billableByDefault
  if (edits.archived !== undefined) patch.archived = edits.archived
  if (edits.budget !== undefined) Object.assign(patch, budgetFields(edits.budget))
  return patch
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
