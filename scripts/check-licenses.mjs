// SPDX-License-Identifier: GPL-3.0-or-later
// Fails if any dependency has a license that isn't on the GPL-3.0-compatible
// allowlist. Every package is checked, not just "dependencies": the app bundles
// code from devDependencies (React, zod, …), so that split doesn't say what ships.
// To approve a new license, add it here in a reviewed commit.
import { execSync } from 'node:child_process'

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0', // browser-support data used by build tools (caniuse-lite)
  'CC0-1.0',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL', // GPL-compatible per the FSF; small helpers inside electron-builder
  'Zlib',
])

// A few packages ship license expressions like "(MIT OR Apache-2.0)". Any allowed
// option in an OR expression is enough; every part of an AND expression must be allowed.
function isAllowed(expr) {
  const clean = expr.replace(/[()]/g, '').trim()
  if (clean.includes(' OR ')) return clean.split(' OR ').some((p) => isAllowed(p))
  if (clean.includes(' AND ')) return clean.split(' AND ').every((p) => isAllowed(p))
  return ALLOWED.has(clean)
}

const raw = execSync('pnpm licenses list --json --recursive', { encoding: 'utf8' })
const byLicense = JSON.parse(raw)

const problems = []
for (const [license, pkgs] of Object.entries(byLicense)) {
  if (isAllowed(license)) continue
  for (const pkg of pkgs) problems.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`)
}

if (problems.length) {
  console.error('Dependencies with licenses not on the GPL-3.0-compatible allowlist:\n')
  for (const p of problems) console.error('  ' + p)
  console.error('\nReview these, then add the license to scripts/check-licenses.mjs if compatible.')
  process.exit(1)
}

const count = Object.values(byLicense).reduce((n, pkgs) => n + pkgs.length, 0)
console.log(`License check passed (${count} packages).`)
