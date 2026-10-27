// SPDX-License-Identifier: GPL-3.0-or-later
// The Local API's messages, as defined in docs/protocol.md (keep the two in step).
// Incoming messages come from other programs, so zod checks every one before
// Stint acts on it. Outgoing messages are plain types.
import { z } from 'zod'

export const PROTOCOL_VERSION = 1

/** Close codes (docs/protocol.md "Handshake"). */
export const CloseCode = {
  goingAway: 1001,
  unauthorized: 4001,
  unsupportedVersion: 4002,
  tokenChanged: 4003,
  helloTimeout: 4008,
} as const

const projectId = z.string().min(1).max(100)
// Optional, echoed in error replies so a client can match them to the command.
const commandId = z.string().max(100).optional()

export const helloMessage = z.object({
  type: z.literal('hello'),
  token: z.string().max(200),
  client: z.string().min(1).max(50),
  v: z.number().int(),
})

// z.object (not strictObject) ignores unknown fields, so newer clients can add some.
export const commandMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), projectId, id: commandId }),
  z.object({ type: z.literal('stop'), id: commandId }),
  z.object({ type: z.literal('toggle'), projectId, id: commandId }),
  z.object({ type: z.literal('openSwitcher'), id: commandId }),
  z.object({ type: z.literal('getState'), id: commandId }),
  z.object({ type: z.literal('getProjects'), id: commandId }),
])

export type HelloMessage = z.infer<typeof helloMessage>
export type CommandMessage = z.infer<typeof commandMessage>

export interface RunningTimer {
  sessionId: string
  projectId: string
  clientId: string
  startedAt: number
}

export interface StateMessage {
  type: 'state'
  running: RunningTimer | null
  /** Nine slots (index 0 = slot 1): a project id or null. */
  favorites: (string | null)[]
  totals: {
    todaySeconds: number
    weekSeconds: number
    unbilledSeconds: number
    unbilledAmounts: { currency: string; cents: number }[]
  }
}

export interface ProjectEntry {
  id: string
  clientId: string
  name: string
  clientName: string
  color: string
}

export interface ProjectsMessage {
  type: 'projects'
  list: ProjectEntry[]
}

export interface ErrorMessage {
  type: 'error'
  code: string
  message: string
  id?: string
}

export type ServerMessage = StateMessage | ProjectsMessage | ErrorMessage
