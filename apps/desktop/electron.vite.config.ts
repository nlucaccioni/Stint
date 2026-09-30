// SPDX-License-Identifier: GPL-3.0-or-later
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Workspace packages ship as TypeScript source, so they must be bundled into the
// app rather than loaded from node_modules at runtime.
const bundleWorkspace = { exclude: ['@stint/core', '@stint/ui'] }

export default defineConfig({
  main: {
    build: { externalizeDeps: bundleWorkspace },
  },
  preload: {
    build: {
      externalizeDeps: bundleWorkspace,
      rollupOptions: {
        // Sandboxed preload scripts can't be ES modules, so emit CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer') } },
    plugins: [react()],
  },
})
