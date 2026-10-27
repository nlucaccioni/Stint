// SPDX-License-Identifier: GPL-3.0-or-later
// The Local API server (SPEC.md §8, docs/protocol.md): a WebSocket server on
// 127.0.0.1 that lets the Keypad plugin control the timer and read totals.
//
// This file only knows about connections and messages. What the commands do and
// what `state` contains come in through LocalApiDeps, so tests can run the server
// without Electron.
import { timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { ZodError } from 'zod'
import { StintError } from '@stint/core'
import {
  CloseCode,
  commandMessage,
  helloMessage,
  PROTOCOL_VERSION,
  type CommandMessage,
  type ProjectsMessage,
  type ServerMessage,
  type StateMessage,
} from './protocol'

export interface LocalApiDeps {
  /** Timer commands. They throw StintError when a rule says no (e.g. archived project). */
  start: (projectId: string) => void
  stop: () => void
  toggle: (projectId: string) => void
  openSwitcher: () => void
  getState: () => StateMessage
  getProjects: () => ProjectsMessage
  /** Called with the names of the connected clients whenever one connects or leaves. */
  onClientsChanged?: (clients: string[]) => void
  /** How long a new connection has to say hello. */
  helloTimeoutMs?: number
  /** How often to send `state` even when nothing changed. */
  heartbeatMs?: number
}

const MAX_MESSAGE_BYTES = 64 * 1024

export class LocalApiServer {
  private wss: WebSocketServer | null = null
  private token = ''
  /** Connections that passed the handshake, with the client name from their hello. */
  private readonly clients = new Map<WebSocket, string>()
  private heartbeat: NodeJS.Timeout | null = null
  private stateQueued = false

  constructor(private readonly deps: LocalApiDeps) {}

  /** The port actually listened on (useful when started on port 0 in tests). */
  get port(): number | null {
    const address = this.wss?.address()
    return address && typeof address === 'object' ? (address as AddressInfo).port : null
  }

  get clientNames(): string[] {
    return [...this.clients.values()]
  }

  /** Start listening. Rejects (e.g. with code EADDRINUSE) if the port can't be used. */
  async start(port: number, token: string): Promise<void> {
    await this.stop()
    this.token = token
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port,
      maxPayload: MAX_MESSAGE_BYTES,
      // Browsers always send an Origin header and other programs don't. Refusing
      // it means no web page can connect, even one that guesses the port.
      verifyClient: (info: { req: { headers: Record<string, unknown> } }) =>
        info.req.headers.origin === undefined,
    })
    await new Promise<void>((resolve, reject) => {
      wss.once('listening', resolve)
      wss.once('error', reject)
    })
    wss.on('error', (error) => console.error('[local-api] server error', error))
    wss.on('connection', (socket) => this.accept(socket))
    this.wss = wss

    this.heartbeat = setInterval(() => this.sendState(), this.deps.heartbeatMs ?? 60_000)
    // Don't keep the process alive just for the heartbeat.
    this.heartbeat.unref()
  }

  /** Close every connection and stop listening. */
  async stop(code: number = CloseCode.goingAway, reason = 'Stint is closing.'): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    const wss = this.wss
    if (!wss) return
    this.wss = null
    for (const socket of wss.clients) socket.close(code, reason)
    this.clients.clear()
    this.deps.onClientsChanged?.([])
    await new Promise<void>((resolve) => wss.close(() => resolve()))
  }

  /** Use a new token; connected clients are dropped and must reconnect with it. */
  setToken(token: string): void {
    this.token = token
    for (const socket of this.clients.keys()) {
      socket.close(CloseCode.tokenChanged, 'The token changed.')
    }
  }

  /**
   * Push fresh `state` to every client. Several changes in a row (a timer switch
   * reports both a timer and a sessions change) are sent as one message.
   */
  notifyState(): void {
    if (this.stateQueued) return
    this.stateQueued = true
    setImmediate(() => {
      this.stateQueued = false
      this.sendState()
    })
  }

  notifyProjects(): void {
    if (this.clients.size === 0) return
    this.broadcast(this.deps.getProjects())
  }

  private sendState(): void {
    if (this.clients.size === 0) return
    this.broadcast(this.deps.getState())
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message)
    for (const socket of this.clients.keys()) socket.send(data)
  }

  private accept(socket: WebSocket): void {
    const reject = (closeCode: number, code: string, message: string) => {
      clearTimeout(timeout)
      send(socket, { type: 'error', code, message })
      socket.close(closeCode, message)
    }
    const timeout = setTimeout(() => {
      reject(CloseCode.helloTimeout, 'hello-timeout', 'No hello received in time.')
    }, this.deps.helloTimeoutMs ?? 5000)

    // The first message must be a valid hello; everything after it is a command.
    socket.once('message', (data) => {
      clearTimeout(timeout)
      const hello = helloMessage.safeParse(parseJson(data))
      if (!hello.success || !this.tokenMatches(hello.data.token)) {
        reject(CloseCode.unauthorized, 'unauthorized', 'Missing or wrong token.')
        return
      }
      if (hello.data.v !== PROTOCOL_VERSION) {
        reject(
          CloseCode.unsupportedVersion,
          'unsupported-version',
          `Stint speaks protocol version ${PROTOCOL_VERSION}.`,
        )
        return
      }
      this.clients.set(socket, hello.data.client)
      this.deps.onClientsChanged?.(this.clientNames)
      send(socket, this.deps.getState())
      send(socket, this.deps.getProjects())
      socket.on('message', (data) => this.handle(socket, data))
    })

    socket.on('close', () => {
      clearTimeout(timeout)
      if (this.clients.delete(socket)) this.deps.onClientsChanged?.(this.clientNames)
    })
    // Without a listener, a socket error (e.g. a message over the size limit)
    // would crash the main process. ws closes the socket itself afterwards.
    socket.on('error', (error) => console.warn('[local-api] connection error', error.message))
  }

  private handle(socket: WebSocket, data: RawData): void {
    const raw = parseJson(data)
    try {
      this.run(socket, commandMessage.parse(raw))
    } catch (error) {
      // Echo the command's id, even from a malformed command, if it had a usable one.
      const id = (raw as { id?: unknown } | undefined)?.id
      const echo = typeof id === 'string' && id.length <= 100 ? { id } : {}
      send(socket, { ...errorInfo(error), ...echo })
    }
  }

  private run(socket: WebSocket, command: CommandMessage): void {
    switch (command.type) {
      case 'start':
        return this.deps.start(command.projectId)
      case 'stop':
        return this.deps.stop()
      case 'toggle':
        return this.deps.toggle(command.projectId)
      case 'openSwitcher':
        return this.deps.openSwitcher()
      case 'getState':
        return send(socket, this.deps.getState())
      case 'getProjects':
        return send(socket, this.deps.getProjects())
    }
  }

  /** Compare in constant time, so response timing can't reveal the token bit by bit. */
  private tokenMatches(given: string): boolean {
    const a = Buffer.from(given)
    const b = Buffer.from(this.token)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message))
}

/** Parse a text frame; anything unparseable becomes undefined (and then fails zod). */
function parseJson(data: RawData): unknown {
  try {
    return JSON.parse(data.toString()) as unknown
  } catch {
    return undefined
  }
}

function errorInfo(error: unknown): { type: 'error'; code: string; message: string } {
  if (error instanceof StintError)
    return { type: 'error', code: error.code, message: error.message }
  if (error instanceof ZodError) {
    return { type: 'error', code: 'invalid-message', message: 'Unknown or malformed message.' }
  }
  console.error('[local-api] unexpected error', error)
  return { type: 'error', code: 'internal', message: 'Something went wrong.' }
}
