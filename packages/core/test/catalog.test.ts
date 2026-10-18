// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { clientPatch, newClient, newProject, projectPatch } from '../src/catalog'
import { ctx } from './fixtures'

const now = 1_000

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return (e as { code?: string }).code
  }
  return undefined
}

const clientInput = { name: '  Acme  ', color: '#3366CC', hourlyRateCents: 10_000, currency: 'USD' }
const projectInput = {
  clientId: 'c1',
  name: 'Website',
  hourlyRateCents: null,
  billableByDefault: true,
}

describe('newClient', () => {
  it('creates a normalized client with sync fields', () => {
    expect(newClient(clientInput, ctx(now))).toEqual({
      id: 'new-1',
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-A',
      deletedAt: null,
      name: 'Acme',
      color: '#3366cc',
      hourlyRateCents: 10_000,
      currency: 'USD',
      archived: false,
    })
  })

  it.each([
    [{ name: '   ' }, 'invalid-name'],
    [{ name: 'x'.repeat(101) }, 'invalid-name'],
    [{ color: 'blue' }, 'invalid-color'],
    [{ color: '#fff' }, 'invalid-color'],
    [{ hourlyRateCents: -1 }, 'invalid-rate'],
    [{ hourlyRateCents: 1.5 }, 'invalid-rate'],
    [{ currency: 'usd' }, 'invalid-currency'],
    [{ currency: 'ZZZ' }, 'invalid-currency'],
  ])('rejects %j', (override, expected) => {
    expect(code(() => newClient({ ...clientInput, ...override }, ctx(now)))).toBe(expected)
  })

  it('allows no rate', () => {
    expect(
      newClient({ ...clientInput, hourlyRateCents: null }, ctx(now)).hourlyRateCents,
    ).toBeNull()
  })
})

describe('clientPatch', () => {
  it('validates and stamps only the fields given', () => {
    expect(clientPatch({ name: ' New ', archived: true }, ctx(now))).toEqual({
      name: 'New',
      archived: true,
      updatedAt: now,
      deviceId: 'dev-A',
    })
  })

  it('can clear the rate', () => {
    expect(clientPatch({ hourlyRateCents: null }, ctx(now))).toMatchObject({
      hourlyRateCents: null,
    })
  })

  it('rejects invalid fields', () => {
    expect(code(() => clientPatch({ color: 'red' }, ctx(now)))).toBe('invalid-color')
  })
})

describe('projects', () => {
  it('creates a project that inherits the client rate by default', () => {
    expect(newProject(projectInput, ctx(now))).toMatchObject({
      id: 'new-1',
      clientId: 'c1',
      name: 'Website',
      hourlyRateCents: null,
      billableByDefault: true,
      archived: false,
    })
  })

  it('validates an own rate', () => {
    expect(code(() => newProject({ ...projectInput, hourlyRateCents: -5 }, ctx(now)))).toBe(
      'invalid-rate',
    )
  })

  it('patches only the given fields', () => {
    expect(projectPatch({ billableByDefault: false }, ctx(now))).toEqual({
      billableByDefault: false,
      updatedAt: now,
      deviceId: 'dev-A',
    })
  })
})
