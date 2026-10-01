// SPDX-License-Identifier: GPL-3.0-or-later
// Database schema, as an ordered list of migrations. SQLite tracks which have run
// in `PRAGMA user_version`. To change the schema, append a new entry — never edit
// one that has shipped, since existing databases have already run it.
//
// Conventions (SPEC.md §5):
// - IDs are UUIDv7 text; timestamps are integer UTC ms; money is integer cents.
// - Booleans are INTEGER 0/1. Tables are STRICT so SQLite enforces column types.
// - No foreign-key constraints: once sync exists, records can arrive in any order
//   (a session before its project), so relationships are enforced by the app.

export const migrations: readonly string[] = [
  // 1 — clients, projects, sessions
  `
  CREATE TABLE clients (
    id                TEXT PRIMARY KEY NOT NULL,
    name              TEXT NOT NULL,
    color             TEXT NOT NULL,
    hourly_rate_cents INTEGER CHECK (hourly_rate_cents >= 0),
    currency          TEXT NOT NULL,
    archived          INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    device_id         TEXT NOT NULL,
    deleted_at        INTEGER
  ) STRICT;

  CREATE TABLE projects (
    id                  TEXT PRIMARY KEY NOT NULL,
    client_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    color               TEXT,
    hourly_rate_cents   INTEGER CHECK (hourly_rate_cents >= 0),
    billable_by_default INTEGER NOT NULL DEFAULT 1,
    archived            INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    device_id           TEXT NOT NULL,
    deleted_at          INTEGER
  ) STRICT;
  CREATE INDEX projects_client_id ON projects (client_id);

  CREATE TABLE sessions (
    id               TEXT PRIMARY KEY NOT NULL,
    project_id       TEXT NOT NULL,
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER CHECK (ended_at IS NULL OR ended_at > started_at),
    note             TEXT NOT NULL DEFAULT '',
    billable         INTEGER NOT NULL,
    billing_batch_id TEXT,
    source           TEXT NOT NULL CHECK (source IN ('timer', 'manual', 'split')),
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    device_id        TEXT NOT NULL,
    deleted_at       INTEGER
  ) STRICT;
  CREATE INDEX sessions_started_at ON sessions (started_at);
  CREATE INDEX sessions_project_id ON sessions (project_id);

  -- At most one running timer, enforced by the database itself: every running,
  -- non-deleted session indexes the same constant value, so a second one is rejected.
  CREATE UNIQUE INDEX sessions_one_running ON sessions ((1))
    WHERE ended_at IS NULL AND deleted_at IS NULL;
  `,

  // 2 — synced preferences. One row per setting, and the row's id is the setting's
  // name (e.g. 'idleMinutes') rather than a random UUID, so when sync arrives two
  // devices changing the same setting update the same record (last write wins).
  `
  CREATE TABLE preferences (
    id         TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    device_id  TEXT NOT NULL,
    deleted_at INTEGER
  ) STRICT;
  `,

  // 3 — billing batches, and the rate each session was billed at.
  `
  ALTER TABLE sessions ADD COLUMN billed_rate_cents INTEGER CHECK (billed_rate_cents >= 0);
  CREATE INDEX sessions_billing_batch_id ON sessions (billing_batch_id);

  CREATE TABLE billing_batches (
    id               TEXT PRIMARY KEY NOT NULL,
    client_id        TEXT NOT NULL,
    range_start      INTEGER NOT NULL,
    range_end        INTEGER NOT NULL,
    reference        TEXT NOT NULL DEFAULT '',
    billed_at        INTEGER NOT NULL,
    paid_at          INTEGER,
    note             TEXT NOT NULL DEFAULT '',
    rounding_minutes INTEGER NOT NULL DEFAULT 0 CHECK (rounding_minutes >= 0),
    rounding_mode    TEXT NOT NULL DEFAULT 'up' CHECK (rounding_mode IN ('up', 'nearest')),
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    device_id        TEXT NOT NULL,
    deleted_at       INTEGER
  ) STRICT;
  CREATE INDEX billing_batches_client_id ON billing_batches (client_id);
  `,
]
