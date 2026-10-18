// SPDX-License-Identifier: GPL-3.0-or-later
// Fills the development database ("Stint Dev" folder) with sample clients,
// projects, about eight weeks of sessions, and a couple of billing batches.
// Never touches the real "Stint" folder.
//
//   pnpm seed            seed an empty dev database
//   pnpm seed --reset    wipe the dev database first, then seed
//
// Run `pnpm dev` once first so the database and its schema exist, and quit the
// app before seeding so it reloads the new data.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 4
const HOUR = 3_600_000
const MINUTE = 60_000
const DAY = 24 * HOUR

const appData =
  process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
const dir = join(appData, 'Stint Dev')
const dbPath = join(dir, 'stint.db')

if (!existsSync(dbPath)) fail(`No dev database at ${dbPath}. Run \`pnpm dev\` once first.`)

const deviceId = JSON.parse(readFileSync(join(dir, 'device.json'), 'utf8')).deviceId
const db = new DatabaseSync(dbPath)
db.exec('PRAGMA busy_timeout = 5000')

const version = db.prepare('PRAGMA user_version').get().user_version
if (version !== SCHEMA_VERSION) {
  fail(`Dev database is schema v${version}; this script writes v${SCHEMA_VERSION}. Update it.`)
}

const reset = process.argv.includes('--reset')
const existing = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n
if (existing > 0 && !reset) fail('Dev database already has clients. Use `pnpm seed --reset`.')

// Deterministic randomness, so every seed looks the same.
let state = 42
const rand = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32
const pick = (list) => list[Math.floor(rand() * list.length)]

/** UUIDv7: 48-bit ms timestamp, version 7, variant bits, then random. */
function uuidv7(ms) {
  const b = randomBytes(16)
  b.writeUIntBE(ms, 0, 6)
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const now = Date.now()
const startOfDay = (ms) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const today = startOfDay(now)
const created = today - 70 * DAY
const sync = (at = created) => ({
  id: uuidv7(at),
  created_at: at,
  updated_at: at,
  device_id: deviceId,
  deleted_at: null,
})

function insert(table, row) {
  const cols = Object.keys(row)
  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  ).run(...Object.values(row))
}

// ---- Catalog ---------------------------------------------------------------

const clients = [
  { key: 'north', name: 'Northwind Studio', color: '#55e6f6', rate: 9500, currency: 'USD' },
  { key: 'fern', name: 'Fern & Field', color: '#55f69d', rate: 8000, currency: 'USD' },
  { key: 'atelier', name: 'Atelier Lumen', color: '#a78bfa', rate: 8500, currency: 'EUR' },
  { key: 'harbor', name: 'Harbor Coffee', color: '#f6c955', rate: 6500, currency: 'USD' },
  { key: 'self', name: 'Studio (internal)', color: '#94a3b8', rate: null, currency: 'USD' },
  {
    key: 'old',
    name: 'Old Mill Bakery',
    color: '#f67a55',
    rate: 6000,
    currency: 'USD',
    archived: true,
  },
]

const projects = [
  { key: 'north-web', client: 'north', name: 'Website redesign', budgetMinutes: 60 * 60 },
  { key: 'north-ds', client: 'north', name: 'Design system', rate: 11000 },
  { key: 'fern-brand', client: 'fern', name: 'Brand identity', budgetCents: 400000 },
  { key: 'fern-pack', client: 'fern', name: 'Packaging' },
  {
    key: 'atelier-app',
    client: 'atelier',
    name: 'Mobile app UI',
    budgetMinutes: 20 * 60,
    period: 'month',
  },
  { key: 'harbor-menu', client: 'harbor', name: 'Menu & signage' },
  {
    key: 'harbor-retainer',
    client: 'harbor',
    name: 'Monthly retainer',
    budgetMinutes: 10 * 60,
    period: 'month',
  },
  { key: 'self-admin', client: 'self', name: 'Admin & invoicing', billable: false },
  { key: 'self-portfolio', client: 'self', name: 'Portfolio', billable: false },
  { key: 'old-site', client: 'old', name: 'Online shop', archived: true },
]

const clientRows = {}
const projectRows = {}

function seed() {
  for (const c of clients) {
    const row = {
      ...sync(),
      name: c.name,
      color: c.color,
      hourly_rate_cents: c.rate,
      currency: c.currency,
      archived: c.archived ? 1 : 0,
    }
    insert('clients', row)
    clientRows[c.key] = { ...row, ...c }
  }
  for (const p of projects) {
    const row = {
      ...sync(),
      client_id: clientRows[p.client].id,
      name: p.name,
      hourly_rate_cents: p.rate ?? null,
      billable_by_default: p.billable === false ? 0 : 1,
      archived: p.archived ? 1 : 0,
      budget_minutes: p.budgetMinutes ?? null,
      budget_cents: p.budgetCents ?? null,
      budget_period: p.period ?? 'total',
      budget_reset_day: 1,
    }
    insert('projects', row)
    projectRows[p.key] = { ...row, ...p }
  }

  // ---- Sessions: weekdays over the last eight weeks ------------------------

  const notes = {
    'north-web': [
      'Homepage wireframes',
      'Nav and footer',
      'Client review call',
      'Responsive pass',
      'Case study template',
    ],
    'north-ds': ['Button and input tokens', 'Type scale', 'Docs for components', 'Color audit'],
    'fern-brand': ['Logo explorations', 'Moodboard', 'Presentation deck', 'Revisions round 2'],
    'fern-pack': ['Label dielines', 'Print proofs', 'Supplier emails'],
    'atelier-app': ['Onboarding flow', 'Settings screens', 'Prototype in Figma', 'Handoff notes'],
    'harbor-menu': ['Menu layout', 'Chalkboard signage', 'Print files'],
    'harbor-retainer': ['Instagram posts', 'Weekly check-in', 'Promo flyer'],
    'self-admin': ['Invoices', 'Bookkeeping', 'Email catch-up'],
    'self-portfolio': ['Case study write-up', 'Site update'],
  }
  // Projects in rotation for each week (index 0 = oldest week).
  const active = (week) => [
    'north-web',
    'fern-brand',
    'harbor-retainer',
    'self-admin',
    week < 4 ? 'fern-pack' : 'north-ds',
    week >= 2 ? 'atelier-app' : 'harbor-menu',
    week % 3 === 0 ? 'self-portfolio' : 'north-web',
  ]

  const sessions = []
  const weeks = 8
  const firstDay = today - weeks * 7 * DAY
  for (let day = firstDay; day <= today; day += DAY) {
    const date = new Date(day)
    const weekday = date.getDay()
    if (weekday === 0 || weekday === 6) {
      if (rand() < 0.85) continue // the odd weekend hour
    }
    const week = Math.floor((day - firstDay) / (7 * DAY))
    let t = day + 9 * HOUR + Math.round(rand() * 4) * 15 * MINUTE
    const count = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
      const key = pick(active(week))
      const length = (30 + Math.floor(rand() * 10) * 15) * MINUTE
      const end = t + length
      if (day === today && end > now) break
      sessions.push({ key, start: t, end, note: pick(notes[key]), manual: rand() < 0.15 })
      t = end + (15 + Math.floor(rand() * 4) * 15) * MINUTE
    }
  }
  // One overlapping pair yesterday, so the overlap flag has something to show.
  const yesterday = sessions.filter((s) => s.start >= today - DAY && s.start < today)
  if (yesterday.length > 0) {
    const s = yesterday[0]
    sessions.push({
      key: 'self-admin',
      start: s.end - 20 * MINUTE,
      end: s.end + 25 * MINUTE,
      note: 'Forgot to stop the timer?',
      manual: true,
    })
  }

  // ---- Billing: Northwind paid two months back, Fern billed last month ----

  const monthStart = (offset) => {
    const d = new Date(today)
    d.setDate(1)
    d.setMonth(d.getMonth() + offset)
    return d.getTime()
  }
  const batches = [
    { client: 'north', from: monthStart(-2), to: monthStart(-1), ref: 'INV-041', paid: true },
    { client: 'north', from: monthStart(-1), to: monthStart(0), ref: 'INV-044', paid: false },
    { client: 'fern', from: monthStart(-1), to: monthStart(0), ref: 'INV-043', paid: false },
  ]
  const batchIds = batches.map((b) => {
    const billedAt = b.to + 2 * DAY + 10 * HOUR
    const row = {
      ...sync(billedAt),
      client_id: clientRows[b.client].id,
      range_start: b.from,
      range_end: b.to,
      reference: b.ref,
      billed_at: billedAt,
      paid_at: b.paid ? billedAt + 12 * DAY : null,
      note: '',
      rounding_minutes: 0,
      rounding_mode: 'up',
    }
    insert('billing_batches', row)
    return { ...b, id: row.id }
  })

  for (const s of sessions) {
    const p = projectRows[s.key]
    const c = clientRows[p.client]
    const billable = p.billable !== false
    const batch =
      billable && batchIds.find((b) => b.client === p.client && s.start >= b.from && s.start < b.to)
    insert('sessions', {
      ...sync(s.end),
      project_id: p.id,
      started_at: s.start,
      ended_at: s.end,
      note: s.note,
      billable: billable ? 1 : 0,
      billing_batch_id: batch ? batch.id : null,
      billed_rate_cents: batch ? (p.rate ?? c.rate) : null,
      source: s.manual ? 'manual' : 'timer',
    })
  }

  // ---- Favorites: the first four slots -------------------------------------

  const favorites = Array.from({ length: 9 }, () => null)
  ;['north-web', 'fern-brand', 'atelier-app', 'harbor-retainer'].forEach((k, i) => {
    favorites[i] = projectRows[k].id
  })
  db.prepare(
    `INSERT INTO preferences (id, value, created_at, updated_at, device_id, deleted_at)
     VALUES ('favorites', ?, ?, ?, ?, NULL)
     ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(favorites), now, now, deviceId)

  return { sessions: sessions.length, batches: batches.length }
}

db.exec('BEGIN IMMEDIATE')
try {
  if (reset) {
    for (const table of ['sessions', 'billing_batches', 'projects', 'clients', 'preferences']) {
      db.exec(`DELETE FROM ${table}`)
    }
  }
  const counts = seed()
  db.exec('COMMIT')
  console.log(
    `Seeded ${dbPath}: ${clients.length} clients, ${projects.length} projects, ` +
      `${counts.sessions} sessions, ${counts.batches} billing batches.`,
  )
} catch (error) {
  db.exec('ROLLBACK')
  throw error
} finally {
  db.close()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
