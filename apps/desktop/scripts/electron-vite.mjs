// SPDX-License-Identifier: GPL-3.0-or-later
// Runs electron-vite with ELECTRON_RUN_AS_NODE removed. VS Code (itself an Electron
// app) sets that variable for processes started from its terminal, which makes
// Electron behave like plain Node.js and crash on startup.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const bin = join(dirname(require.resolve('electron-vite/package.json')), 'bin/electron-vite.js')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 1))
