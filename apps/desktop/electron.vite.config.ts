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
      // ws (the Local API server) tries to load an optional native add-on, bufferutil.
      // Bundling replaces the missing add-on with an empty stub that ws would then
      // call and crash on, so tell ws not to try. Its built-in code is used instead.
      'process.env.WS_NO_BUFFER_UTIL': JSON.stringify('1'),
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
