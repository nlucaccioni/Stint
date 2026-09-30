// SPDX-License-Identifier: GPL-3.0-or-later
import type { Project } from '@stint/core'
import type { Db } from './connection'
import { fromRow, getById, insertRow, selectList, updateRow } from './table'
import { projectsTable as t } from './tables'

/** All non-deleted projects, including archived ones, by name. */
export function listProjects(db: Db): Project[] {
  return db
    .prepare(
      `SELECT ${selectList(t)} FROM projects WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    )
    .all()
    .map((row) => fromRow(t, row))
}

export const getProject = (db: Db, id: string) => getById(db, t, id)
export const insertProject = (db: Db, project: Project) => insertRow(db, t, project)
export const updateProject = (db: Db, id: string, patch: Partial<Project>) =>
  updateRow(db, t, id, patch)
