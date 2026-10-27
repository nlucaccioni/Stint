// SPDX-License-Identifier: GPL-3.0-or-later
import { basename, resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Workspace packages ship as TypeScript source, so they must be bundled into the
// app rather than loaded from node_modules at runtime.
const bundleWorkspace = { exclude: ['@stint/core', '@stint/ui'] }

export default defineConfig({
  main: {
    build: { externalizeDeps: bundleWorkspace },
    define: {
      // ws (the Local API server) tries to load two optional native add-ons,
      // bufferutil and utf-8-validate. Bundling replaces each missing add-on with a
      // stub that either crashes when ws calls it (production) or throws as soon as
      // the app starts (dev). These switches make ws skip the add-ons, so the
      // bundler drops those imports entirely. ws's built-in code is used instead.
      'process.env.WS_NO_BUFFER_UTIL': JSON.stringify('1'),
      'process.env.WS_NO_UTF_8_VALIDATE': JSON.stringify('1'),
    },
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
    css: {
      modules: {
        // Readable class names in DevTools: "TimerBar__pill" instead of "_pill_6hwkh_3".
        // Each class is prefixed with its file's name, so names stay unique per component.
        generateScopedName: (name, filename) =>
          `${basename(filename).replace(/\.module\.css(\?.*)?$/, '')}__${name}`,
      },
    },
  },
})
