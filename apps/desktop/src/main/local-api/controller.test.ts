// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LocalApiController } from './controller'

let dir: string
let controller: LocalApiController
let blocker: Server | null = null

/** A port nothing is using right now. */
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stint-local-api-'))
  controller = new LocalApiController({
    dir,
    defaultPort: await freePort(),
    deps: {
      start: vi.fn(),
      stop: vi.fn(),
      toggle: vi.fn(),
      openSwitcher: vi.fn(),
      getState: vi.fn(),
      getProjects: vi.fn(),
    },
  })
})

afterEach(async () => {
  await controller.stop()
  blocker?.close()
  blocker = null
  rmSync(dir, { recursive: true, force: true })
})

const savedFile = () => JSON.parse(readFileSync(join(dir, 'local-api.json'), 'utf8')) as object

it('listens when enabled and stops when turned off', async () => {
  expect(await controller.apply()).toMatchObject({ enabled: true, listening: true, problem: null })
  expect(await controller.update({ enabled: false })).toMatchObject({
    enabled: false,
    listening: false,
  })
  expect(savedFile()).toMatchObject({ enabled: false })
})

it('reports a port that another program is using', async () => {
  const port = await freePort()
  blocker = createServer()
  await new Promise<void>((resolve) => blocker!.listen(port, '127.0.0.1', resolve))
  expect(await controller.update({ port })).toMatchObject({
    port,
    listening: false,
    problem: 'in-use',
  })
})

it('rejects ports outside 1024–65535', async () => {
  await expect(controller.update({ port: 80 })).rejects.toMatchObject({
    code: 'invalid-preference',
  })
})

it('saves a new token', () => {
  const before = savedFile()
  controller.regenerateToken()
  expect(savedFile()).not.toMatchObject({ token: (before as { token: string }).token })
})
