// SPDX-License-Identifier: GPL-3.0-or-later
// Actions in core don't touch the database. They return a list of changes,
// which the desktop app applies in a single transaction. This keeps the rules
// testable and lets web/sync reuse them later.
import { newId as defaultNewId } from './ids'
import type { Session } from './types'

export type SessionPatch = Partial<Omit<Session, 'id' | 'createdAt'>>

export type SessionChange =
  { kind: 'insert'; session: Session } | { kind: 'update'; id: string; patch: SessionPatch }

/** Inputs every action needs from the outside world. */
export interface ChangeContext {
  now: number
  deviceId: string
  /** Defaults to UUIDv7; tests pass a deterministic generator. */
  newId?: () => string
}

export function update(ctx: ChangeContext, id: string, patch: SessionPatch): SessionChange {
  return { kind: 'update', id, patch: { ...patch, updatedAt: ctx.now, deviceId: ctx.deviceId } }
}

export function insert(
  ctx: ChangeContext,
  fields: Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deviceId' | 'deletedAt'>,
): SessionChange {
  const id = (ctx.newId ?? defaultNewId)()
  return {
    kind: 'insert',
    session: {
      ...fields,
      id,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deviceId: ctx.deviceId,
      deletedAt: null,
    },
  }
}
