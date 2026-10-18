// SPDX-License-Identifier: GPL-3.0-or-later
// Which client cards are collapsed on the Projects tab. A per-device view
// preference, so it lives in this window's localStorage rather than the database.
import { useState } from 'react'

const KEY = 'stint.collapsedClients'

function load(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function useCollapsedClients() {
  const [collapsed, setCollapsed] = useState(load)

  function toggle(clientId: string) {
    const next = new Set(collapsed)
    if (!next.delete(clientId)) next.add(clientId)
    setCollapsed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      // Storage unavailable: it just won't be remembered.
    }
  }

  return { collapsed, toggle } as const
}
