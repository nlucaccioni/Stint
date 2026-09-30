# Stint

Local-first desktop time tracker for freelance work (macOS + Windows). Full spec: `SPEC.md`. Read it before starting any phase.

## Working with the owner

- Nicholas is a designer, fluent in HTML/CSS/JS/React, new to C#. Explain non-obvious decisions briefly, especially in Electron main-process code and the C# plugin.
- Propose a plan and wait for approval before starting each build phase.
- Work one phase at a time (see SPEC.md §12). Don't build later-phase features early, but don't make choices that block them.

## Stack

- Electron + TypeScript + React, SQLite (better-sqlite3 + Drizzle) in the main process, pnpm workspaces monorepo.
- `packages/core`: all business logic (time math, totals, billing, timer transitions). No UI, Electron, or DB imports.
- `packages/ui`: shared React components and design tokens (CSS variables). Placeholder visual style only; Nicholas will supply the design.
- `apps/desktop`: Electron. `apps/web`: PWA (later). `plugins/logi-keypad`: C# Logi Actions SDK plugin (later).

## Commands

- `pnpm install` — install everything
- `pnpm dev` — run the desktop app in dev mode
- `pnpm test` / `pnpm typecheck` / `pnpm lint` — run across all packages
- `pnpm license-check` — verify dependency licenses are GPL-compatible
- Terminals inside VS Code set `ELECTRON_RUN_AS_NODE=1`, which makes Electron run as plain Node. `pnpm dev` clears it; unset it before launching a packaged build from that terminal.
- New dependencies with install scripts must be approved (`pnpm approve-builds <pkg>`), recorded under `allowBuilds` in `pnpm-workspace.yaml`. pnpm also refuses versions published in the last day; use a slightly older version rather than adding exclusions.

## Rules that must not be broken

- Every synced record uses a device-generated UUIDv7, `createdAt`/`updatedAt`, `deviceId`, and soft delete via `deletedAt`. Timestamps are integer UTC epoch ms. Money is integer cents.
- Totals and billing status are always derived from sessions, never stored.
- Only one timer runs at a time. A running timer is a session with `endedAt = null`.
- Sessions in a billing batch are read-only until explicitly unlocked.
- Device-local settings (deviceId, API token/port) never sync and never go in git.
- Electron security: contextIsolation on, nodeIntegration off, sandboxed renderer, narrow typed preload bridge, zod-validated IPC.
- Local API binds to 127.0.0.1 and requires a token. `docs/protocol.md` is the source of truth for its messages.
- Must work on both macOS and Windows (Cmd/Option vs Ctrl/Alt shortcuts, menu bar vs system tray).

## License (public repo)

- App and packages: GPL-3.0-or-later. Full text in `LICENSE`; SPDX header `GPL-3.0-or-later` in every source file; license field in every `package.json`.
- Keypad plugin: MIT, separate `LICENSE` in `plugins/logi-keypad`. Never commit Logitech DLLs or SDK binaries.
- Only add GPL-3.0-compatible dependencies. Ask before adding anything with another license.
- No secrets in git: `.env` files gitignored, `.env.example` committed.

## Quality

- Unit tests for `packages/core` logic.
- Keep commits small and scoped to one change.
