// SPDX-License-Identifier: GPL-3.0-or-later
// Opens the SQLite database using Node's built-in `node:sqlite` module (bundled
// with Electron). Calls are synchronous: simple to reason about, and fast because
// the database is a local file.
import { DatabaseSync } from 'node:sqlite'
import { migrations } from './migrations'

export type Db = DatabaseSync

/** Open (or create) the database at `path` and bring its schema up to date. Use ':memory:' in tests. */
export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path)
  try {
    // WAL: writes don't block reads and a crash can't corrupt the file.
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA busy_timeout = 5000')
    migrate(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function schemaVersion(db: Db): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

function migrate(db: Db): void {
  const current = schemaVersion(db)
  if (current > migrations.length) {
    // Opened by a newer version of Stint; don't risk writing to a schema we don't know.
    throw new Error(
      `Database schema v${current} is newer than this app supports (v${migrations.length}). Update Stint.`,
    )
  }
  for (let version = current + 1; version <= migrations.length; version++) {
    transaction(db, () => {
      db.exec(migrations[version - 1]!)
      db.exec(`PRAGMA user_version = ${version}`)
    })
  }
}

/**
 * Run `fn` atomically: either every write inside it is saved, or (if it throws) none are.
 * IMMEDIATE takes the write lock up front, so the reads inside see a stable state.
 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
