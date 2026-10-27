// SPDX-License-Identifier: GPL-3.0-or-later
// Runs the real server on a random port and talks to it with a real WebSocket client.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { StintError } from '@stint/core'
import { LocalApiServer, type LocalApiDeps } from './server'
import type { ServerMessage, StateMessage } from './protocol'

const TOKEN = 'a'.repeat(64)
const state: StateMessage = {
  type: 'state',
  running: null,
  favorites: Array.from({ length: 9 }, () => null),
  totals: { todaySeconds: 0, weekSeconds: 0, unbilledSeconds: 0, unbilledAmounts: [] },
}

let server: LocalApiServer
let deps: { [K in keyof LocalApiDeps]-?: NonNullable<LocalApiDeps[K]> }
let port: number

beforeEach(async () => {
  deps = {
    start: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    openSwitcher: vi.fn(),
    getState: vi.fn(() => state),
    getProjects: vi.fn(() => ({ type: 'projects' as const, list: [] })),
    onClientsChanged: vi.fn(),
    helloTimeoutMs: 200,
    heartbeatMs: 60_000,
  }
  server = new LocalApiServer(deps)
  await server.start(0, TOKEN)
  port = server.port!
})

afterEach(async () => {
  await server.stop()
})

/** A test client that queues incoming messages. */
async function connect(headers: Record<string, string> = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { headers })
  const inbox: ServerMessage[] = []
  const waiting: ((m: ServerMessage) => void)[] = []
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage
    const waiter = waiting.shift()
    if (waiter) waiter(message)
    else inbox.push(message)
  })
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)))
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  return {
    ws,
    closed,
    send: (message: unknown) => ws.send(JSON.stringify(message)),
    next: () =>
      new Promise<ServerMessage>((resolve) => {
        const queued = inbox.shift()
        if (queued) resolve(queued)
        else waiting.push(resolve)
      }),
  }
}

async function connectAndHello() {
  const client = await connect()
  client.send({ type: 'hello', token: TOKEN, client: 'test', v: 1 })
  await client.next() // state
  await client.next() // projects
  return client
}

describe('handshake', () => {
  it('sends state then projects after a valid hello', async () => {
    const client = await connect()
    client.send({ type: 'hello', token: TOKEN, client: 'logi-keypad', v: 1 })
    expect(await client.next()).toEqual(state)
    expect(await client.next()).toEqual({ type: 'projects', list: [] })
    expect(server.clientNames).toEqual(['logi-keypad'])
    expect(deps.onClientsChanged).toHaveBeenLastCalledWith(['logi-keypad'])
  })

  it('rejects a wrong token', async () => {
    const client = await connect()
    client.send({ type: 'hello', token: 'b'.repeat(64), client: 'x', v: 1 })
    expect(await client.next()).toMatchObject({ type: 'error', code: 'unauthorized' })
    expect(await client.closed).toBe(4001)
  })

  it('rejects a command sent before hello', async () => {
    const client = await connect()
    client.send({ type: 'stop' })
    expect(await client.next()).toMatchObject({ code: 'unauthorized' })
    expect(await client.closed).toBe(4001)
    expect(deps.stop).not.toHaveBeenCalled()
  })

  it('rejects other protocol versions', async () => {
    const client = await connect()
    client.send({ type: 'hello', token: TOKEN, client: 'x', v: 2 })
    expect(await client.next()).toMatchObject({ code: 'unsupported-version' })
    expect(await client.closed).toBe(4002)
  })

  it('closes connections that never say hello', async () => {
    const client = await connect()
    expect(await client.next()).toMatchObject({ code: 'hello-timeout' })
    expect(await client.closed).toBe(4008)
  })

  it('refuses browsers (any Origin header)', async () => {
    await expect(connect({ Origin: 'https://example.com' })).rejects.toThrow(/401/)
  })
})

describe('commands', () => {
  it('runs timer commands', async () => {
    const client = await connectAndHello()
    client.send({ type: 'start', projectId: 'p1' })
    client.send({ type: 'toggle', projectId: 'p2' })
    client.send({ type: 'stop' })
    client.send({ type: 'openSwitcher' })
    client.send({ type: 'getState' })
    await client.next() // getState reply: everything before it has run
    expect(deps.start).toHaveBeenCalledWith('p1')
    expect(deps.toggle).toHaveBeenCalledWith('p2')
    expect(deps.stop).toHaveBeenCalledOnce()
    expect(deps.openSwitcher).toHaveBeenCalledOnce()
  })

  it('replies to getProjects', async () => {
    const client = await connectAndHello()
    client.send({ type: 'getProjects' })
    expect(await client.next()).toEqual({ type: 'projects', list: [] })
  })

  it('reports rule errors with their code and the command id, and stays connected', async () => {
    vi.mocked(deps.start).mockImplementation(() => {
      throw new StintError('archived', 'Unarchive this project to track time on it.')
    })
    const client = await connectAndHello()
    client.send({ type: 'start', projectId: 'p1', id: '7' })
    expect(await client.next()).toEqual({
      type: 'error',
      code: 'archived',
      message: 'Unarchive this project to track time on it.',
      id: '7',
    })
    client.send({ type: 'getState' })
    expect(await client.next()).toEqual(state)
  })

  it('reports malformed and unknown messages', async () => {
    const client = await connectAndHello()
    client.ws.send('not json')
    expect(await client.next()).toMatchObject({ code: 'invalid-message' })
    client.send({ type: 'start', id: 'x' }) // missing projectId
    expect(await client.next()).toMatchObject({ code: 'invalid-message', id: 'x' })
    client.send({ type: 'deleteEverything' })
    expect(await client.next()).toMatchObject({ code: 'invalid-message' })
  })

  it('ignores unknown fields', async () => {
    const client = await connectAndHello()
    client.send({ type: 'getState', future: true })
    expect(await client.next()).toEqual(state)
  })
})

describe('pushing changes', () => {
  it('sends one state message for several changes in a row', async () => {
    const client = await connectAndHello()
    server.notifyState()
    server.notifyState()
    expect(await client.next()).toEqual(state)
    client.send({ type: 'getProjects' })
    // The next message is the getProjects reply, not a second state.
    expect(await client.next()).toMatchObject({ type: 'projects' })
  })

  it('sends projects when they change', async () => {
    const client = await connectAndHello()
    server.notifyProjects()
    expect(await client.next()).toMatchObject({ type: 'projects' })
  })

  it('drops clients when the token changes', async () => {
    const client = await connectAndHello()
    server.setToken('c'.repeat(64))
    expect(await client.closed).toBe(4003)
    const retry = await connect()
    retry.send({ type: 'hello', token: TOKEN, client: 'x', v: 1 })
    expect(await retry.next()).toMatchObject({ code: 'unauthorized' })
  })

  it('tells clients when Stint stops', async () => {
    const client = await connectAndHello()
    await server.stop()
    expect(await client.closed).toBe(1001)
    expect(deps.onClientsChanged).toHaveBeenLastCalledWith([])
  })
})

it('reports a port that is already in use', async () => {
  const other = new LocalApiServer(deps)
  await expect(other.start(port, TOKEN)).rejects.toMatchObject({ code: 'EADDRINUSE' })
})
