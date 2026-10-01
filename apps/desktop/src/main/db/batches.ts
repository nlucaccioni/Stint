// SPDX-License-Identifier: GPL-3.0-or-later
import type { BillingBatch } from '@stint/core'
import type { Db } from './connection'
import { fromRow, getById, insertRow, selectList, updateRow } from './table'
import { batchesTable as t } from './tables'

/** All non-deleted batches, most recently billed first. */
export function listBatches(db: Db): BillingBatch[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM billing_batches WHERE deleted_at IS NULL ORDER BY billed_at DESC`,
    )
    .all()
    .map((row) => fromRow(t, row))
}

export const getBatch = (db: Db, id: string) => getById(db, t, id)
export const insertBatch = (db: Db, batch: BillingBatch) => insertRow(db, t, batch)

/** Save a whole edited batch (all fields except id). */
export function saveBatch(db: Db, batch: BillingBatch): void {
  const { id, ...fields } = batch
  updateRow<BillingBatch>(db, t, id, fields)
}
