// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import type { BillingBatch, Session } from '@stint/core'
import { api, onEvent } from './api'

interface BillingData {
  batches: BillingBatch[]
  unbilledSessions: Session[]
  billedSessions: Session[]
}

const empty: BillingData = { batches: [], unbilledSessions: [], billedSessions: [] }

async function fetchBilling(): Promise<BillingData> {
  const [batches, unbilledSessions, billedSessions] = await Promise.all([
    api.listBatches(),
    api.listUnbilledSessions(),
    api.listBilledSessions(),
  ])
  return { batches, unbilledSessions, billedSessions }
}

/** Batches and the sessions behind them, reloaded whenever either changes. */
export function useBilling(): BillingData {
  const [data, setData] = useState<BillingData>(empty)

  useEffect(() => {
    let active = true
    const load = () => void fetchBilling().then((d) => active && setData(d))
    load()
    const offBatches = onEvent('batchesChanged', load)
    const offSessions = onEvent('sessionsChanged', load)
    return () => {
      active = false
      offBatches()
      offSessions()
    }
  }, [])

  return data
}
