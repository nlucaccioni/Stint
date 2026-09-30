// SPDX-License-Identifier: GPL-3.0-or-later
// Maps between TypeScript records (camelCase, real booleans) and database rows
// (snake_case, 0/1). Each table lists its columns once; inserts, updates, and
// reads are generated from that list. Column names only ever come from these
// definitions and values are always bound as parameters, so no SQL injection.
import type { SQLInputValue } from 'node:sqlite'
import type { Db } from './connection'

export interface TableDef<T> {
  name: string
  /** Database column for every field. */
  columns: { readonly [K in keyof T]-?: string }
  /** Fields stored as 0/1. */
  booleans: readonly (keyof T)[]
}

export function defineTable<T>(def: TableDef<T>): TableDef<T> {
  return def
}

export function selectList<T>(def: TableDef<T>): string {
  return Object.values<string>(def.columns).join(', ')
}

export function fromRow<T>(def: TableDef<T>, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [field, column] of Object.entries<string>(def.columns)) {
    const value = row[column]
    out[field] = def.booleans.includes(field as keyof T) ? value === 1 : value
  }
  return out as T
}

function toValue<T>(def: TableDef<T>, field: keyof T, value: unknown): SQLInputValue {
  if (def.booleans.includes(field)) return value ? 1 : 0
  return value as SQLInputValue
}

export function insertRow<T>(db: Db, def: TableDef<T>, record: T): void {
  const fields = Object.keys(def.columns) as (keyof T)[]
  const columns = fields.map((f) => def.columns[f])
  const sql = `INSERT INTO ${def.name} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  db.prepare(sql).run(...fields.map((f) => toValue(def, f, record[f])))
}

/** Update the given fields of one row. Throws if the row doesn't exist. */
export function updateRow<T>(db: Db, def: TableDef<T>, id: string, patch: Partial<T>): void {
  const fields = (Object.keys(patch) as (keyof T)[]).filter(
    (f) => patch[f] !== undefined && f in def.columns && f !== 'id',
  )
  if (fields.length === 0) return
  const sets = fields.map((f) => `${def.columns[f]} = ?`).join(', ')
  const result = db
    .prepare(`UPDATE ${def.name} SET ${sets} WHERE id = ?`)
    .run(...fields.map((f) => toValue(def, f, patch[f])), id)
  if (result.changes === 0) throw new Error(`${def.name}: no row with id ${id}`)
}

export function getById<T>(db: Db, def: TableDef<T>, id: string): T | null {
  const row = db.prepare(`SELECT ${selectList(def)} FROM ${def.name} WHERE id = ?`).get(id)
  return row ? fromRow(def, row) : null
}
