// SPDX-License-Identifier: GPL-3.0-or-later
import type { Client } from '@stint/core'
import type { Db } from './connection'
import { fromRow, getById, insertRow, selectList, updateRow } from './table'
import { clientsTable as t } from './tables'

/** All non-deleted clients, including archived ones, by name. */
export function listClients(db: Db): Client[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM clients WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    )
    .all()
    .map((row) => fromRow(t, row))
}

export const getClient = (db: Db, id: string) => getById(db, t, id)
export const insertClient = (db: Db, client: Client) => insertRow(db, t, client)
export const updateClient = (db: Db, id: string, patch: Partial<Client>) =>
  updateRow(db, t, id, patch)
