// SPDX-License-Identifier: GPL-3.0-or-later
import type { StintApi } from '../../shared/api'

declare global {
  interface Window {
    stint: StintApi
  }
}
