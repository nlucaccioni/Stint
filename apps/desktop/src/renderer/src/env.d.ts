// SPDX-License-Identifier: GPL-3.0-or-later
import type { BridgeApi } from '../../shared/api'

declare global {
  interface Window {
    stintBridge: BridgeApi
  }
}
