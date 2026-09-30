// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react'
import type {
  Client,
  ClientEdits,
  ClientInput,
  Project,
  ProjectEdits,
  ProjectInput,
} from '@stint/core'
import { api } from './api'

interface CatalogState {
  clients: Client[]
  projects: Project[]
  projectIdsWithTime: ReadonlySet<string>
  loaded: boolean
  loadError: string | null
}

const initial: CatalogState = {
  clients: [],
  projects: [],
  projectIdsWithTime: new Set(),
  loaded: false,
  loadError: null,
}

async function fetchCatalog(): Promise<CatalogState> {
  try {
    const [clients, projects, withTime] = await Promise.all([
      api.listClients(),
      api.listProjects(),
      api.listProjectIdsWithTime(),
    ])
    return {
      clients,
      projects,
      projectIdsWithTime: new Set(withTime),
      loaded: true,
      loadError: null,
    }
  } catch (e) {
    return { ...initial, loaded: true, loadError: e instanceof Error ? e.message : String(e) }
  }
}

/** Clients and projects from the main process, reloaded after every change. */
export function useCatalog() {
  const [state, setState] = useState<CatalogState>(initial)

  useEffect(() => {
    let active = true
    void fetchCatalog().then((next) => active && setState(next))
    return () => {
      active = false
    }
  }, [])

  /** Run a change, then refresh. Errors are re-thrown so the caller can show them. */
  const mutate = useCallback(async <T>(change: Promise<T>): Promise<T> => {
    const result = await change
    setState(await fetchCatalog())
    return result
  }, [])

  return {
    ...state,
    createClient: (input: ClientInput) => mutate(api.createClient(input)),
    updateClient: (id: string, edits: ClientEdits) => mutate(api.updateClient(id, edits)),
    createProject: (input: ProjectInput) => mutate(api.createProject(input)),
    updateProject: (id: string, edits: ProjectEdits) => mutate(api.updateProject(id, edits)),
    deleteClient: (id: string) => mutate(api.deleteClient(id)),
    deleteProject: (id: string) => mutate(api.deleteProject(id)),
  }
}
