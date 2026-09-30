# Stint — Product & Technical Spec

Stint is a local-first desktop time tracker for freelance work. It tracks time per client and per project, shows per-session readouts and totals, tracks what has been billed and paid, and can be controlled from global keyboard shortcuts and a Logitech MX Keypad.

Owner: Nicholas (designer; strong in HTML/CSS/JS/React, new to C#).

---

## 1. Goals

- Start, stop, and switch timers per client/project with as little friction as possible.
- Readout for each session, plus totals by project, client, and date range.
- Edit recorded time (fix forgotten timers, move/split sessions, add manual entries).
- Track billing status of time: unbilled → billed → paid, via "billing batches."
- Control from global hotkeys and an MX Keypad plugin with live timer display on the keys.
- Work fully offline on desktop. Later: accounts + sync, and a mobile/web PWA.
- Runs on both macOS and Windows (the owner works on both).

## 2. Non-goals (for now)

- Generating invoices. Invoices are sent through several external tools or as PDFs; Stint only records that time was billed and whether it was paid.
- Native mobile apps. Mobile will be a PWA.
- Team/multi-user features.
- Mac App Store / Microsoft Store distribution (GPL and store terms conflict; see §12).

---

## 3. Platforms & stack

| Area              | Choice                                                                      |
| ----------------- | --------------------------------------------------------------------------- |
| Desktop app       | Electron (macOS + Windows), TypeScript                                      |
| UI                | React, shared between desktop and future web app                            |
| Local storage     | SQLite in the Electron main process                                         |
| Keypad plugin     | C# via Logi Actions SDK (Logi Plugin Service, installed with Logi Options+) |
| Future web/mobile | PWA using the same shared React UI                                          |
| Future sync       | Backend TBD (hosted Postgres + auth, or a local-first sync engine)          |

Tooling:

| Concern         | Choice                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| Package manager | pnpm workspaces                                                         |
| Build           | electron-vite                                                           |
| Database        | Built-in `node:sqlite` (no native module), hand-written SQL migrations  |
| IPC validation  | zod (main process validates every renderer request)                     |
| Dates           | date-fns + @date-fns/tz                                                 |
| IDs             | `uuid` v7                                                               |
| Styling         | CSS Modules + CSS variables (design tokens in `packages/ui`)            |
| Tests           | Vitest                                                                  |
| Packaging       | electron-builder (DMG per arch on macOS, NSIS on Windows)               |
| Updates         | electron-updater on Windows; update-available prompt on macOS (see §11) |
| CI / releases   | GitHub Actions on hosted macOS + Windows runners                        |
| License check   | `pnpm licenses list` + allowlist script in CI                           |

### Repository layout (monorepo)

```
stint/
  .github/workflows/  # ci.yml (typecheck, lint, test, license check), release.yml (tag → installers)
  packages/
    core/        # TS: types, data model, totals, billing logic, time math. No UI, no Electron, no DB.
    ui/          # React components + design tokens, shared by desktop and web
  apps/
    desktop/     # Electron: main process (DB, tray, hotkeys, local API), preload, renderer
    web/         # PWA (later phase)
  plugins/
    logi-keypad/ # C# Logi Actions SDK plugin (later phase, MIT — see §12)
  docs/
    protocol.md  # Local API message format (source of truth for app <-> plugin)
```

Most logic belongs in `packages/core` so desktop, web, and sync all share it. The timer's state transitions (start/stop/switch/toggle/stop-at) are pure functions in core that return a list of changes; the main process applies them in a single DB transaction.

---

## 4. Architecture

The desktop app is the single source of truth. Everything else is a remote control.

- **Timer engine** lives in the Electron main process and owns all state.
- **Renderer (React UI)** talks to the main process only through a small, explicit preload bridge. It computes live elapsed time from `startedAt` itself; the main process pushes state only on change.
- **Global hotkeys** and the **tray/menu bar** call the engine directly.
- **Local API**: a WebSocket server on `127.0.0.1` that the Keypad plugin (and future integrations) connect to. It accepts commands and pushes state updates.
- **SQLite** stores everything. Totals are always computed from sessions, never stored.

If the Keypad plugin or Logi Options+ is not running, nothing is lost; the plugin is stateless.

### Electron security baseline

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for renderer windows.
- Expose only named, typed functions through the preload bridge (no generic IPC passthrough). Validate every payload in the main process.
- Content Security Policy on renderer pages.
- Local API binds to `127.0.0.1` only and requires a token (see §8).

---

## 5. Data model

All synced records are designed for future sync from day one.

**Sync-ready rules (every synced table):**

- `id`: UUIDv7 generated on the device. No autoincrement IDs.
- `createdAt`, `updatedAt`: UTC.
- `deviceId`: which device last modified the record. Generated once on first launch and stored in device-local settings.
- `deletedAt`: soft delete. Never hard-delete synced records.

**Storage conventions:**

- Timestamps are stored as integer UTC epoch milliseconds. Format to local time only in the UI.
- Money is stored as integer minor units (cents), never floats. Field names end in `Cents`.
- Currency is an ISO 4217 code.

### Client

- `id`, `name`, `color`, `hourlyRateCents` (nullable), `currency` (defaults to the default-currency setting), `archived`, sync fields.

### Project

- `id`, `clientId`, `name`, `color` (optional, falls back to client color), `hourlyRateCents` (nullable; overrides client rate), `billableByDefault` (default true), `archived`, sync fields.

### Session

- `id`, `projectId`, `startedAt`, `endedAt` (null = currently running), `note`, `billable` (defaults from the project's `billableByDefault`), `billingBatchId` (nullable), `source` (`timer` | `manual` | `split`), sync fields.
- Duration is derived: `endedAt - startedAt` (or `now - startedAt` if running).
- A unique partial index guarantees at most one running session: unique on a constant where `endedAt IS NULL AND deletedAt IS NULL`.
- Phase 3 adds `billedRateCents` (nullable): the effective rate recorded when the session joins a billing batch. This is input data, not a stored total — it keeps past invoices from changing when a rate changes later.

### BillingBatch

- `id`, `clientId`, `rangeStart`, `rangeEnd`, `reference` (free text: invoice number, tool name, "PDF", etc.), `billedAt`, `paidAt` (nullable), `note`, sync fields.
- Status is derived: `paidAt` set → paid; otherwise → billed.

### Settings

Settings are split by whether they belong to the user or to one machine.

**Synced preferences** (a table with sync fields):

- Favorites: up to 9 project slots (shared by hotkeys and Keypad).
- Idle threshold, long-running-timer nudge threshold, week start day, default currency.

**Device-local settings** (JSON file in the app data folder; never synced):

- `deviceId`, local API port and token, window position, hotkey registration results.

### Derived billing status of a session

- `billingBatchId` null → **unbilled**
- In a batch without `paidAt` → **billed**
- In a batch with `paidAt` → **paid**

---

## 6. Behavior rules

### Timers

- Only one timer runs at a time (enforced by the unique index in §5 as well as in the engine).
- Starting a project while another is running stops the current one at that same instant and starts the new one, in one transaction.
- Starting the project that is already running stops it (toggle behavior).
- The running timer is simply a session with `endedAt = null`, so it survives app restarts and will sync naturally later.
- **Idle detection:** after a configurable idle period (default 15 min, using system idle time), when the user returns, prompt: keep the idle time, discard it (end the session when idle began), or discard and continue timing. System sleep/suspend and screen lock count as idle, starting from the moment they happened (system idle time can reset on wake, so these events are handled explicitly).
- **Long-running nudge:** notify after a configurable duration (default 4 hours).
- **"Stop at…":** end a running timer at a chosen past time.
- **Conflict rule (for later sync):** if two devices each have a running session, close the earlier one at the start time of the later one, or prompt the user.

### Editing

All editing is allowed on unbilled sessions:

- Change start/end times (validate end > start; warn on overlaps with other sessions).
- Move a session to another project/client.
- Split a session into two at a chosen time.
- Add a manual entry.
- Delete (soft delete).

### Locking

- Sessions in a billing batch are locked and read-only.
- A deliberate "Unlock" action (with confirmation) removes a session from its batch so it can be edited.

### Billing batches

- Create: pick a client and date range. Stint gathers all unbilled, billable sessions in that range; the user can deselect individual sessions before confirming.
- Record a free-text `reference` for where it was invoiced.
- Mark paid: set `paidAt` (date picker, defaults to today). Can be un-marked.
- Views: unbilled time per client (hours and amount), outstanding batches (billed, not paid, with days waiting), paid history.
- Partial payments are out of scope for v1 (see open questions).

### Totals & reporting

- Totals for today, this week, custom range; grouped by client and by project.
- Sessions that cross a range boundary (e.g. midnight, week start) are clipped to the range when totaling. Day/week boundaries use the local time zone.
- Amounts = hours × effective rate (project rate, else client rate).
- Amounts in different currencies are never summed together; money totals are grouped by currency.
- CSV export of sessions for any range (include client, project, start, end, duration, note, billing status, batch reference). Cells beginning with `=`, `+`, `-`, or `@` are escaped so spreadsheet apps don't evaluate them as formulas.

---

## 7. Desktop UX surfaces

**Main window:** running timer at the top; client/project list with start buttons; session log (grouped by day) with inline editing; totals; billing view.

**Tray / menu bar:**

- macOS: menu bar icon (template image for light/dark) with the running time shown as text next to it.
- Windows: system tray icon with tooltip showing running project and time.
- Menu: running timer + stop, favorites, "Open Stint," quick switcher, quit.

**Global hotkeys (user-configurable):**

- Favorite slots 1–9: `Cmd+Option+1…9` (macOS) / `Ctrl+Alt+1…9` (Windows). Press to start/switch; press the running one to stop.
- Stop: `Cmd+Option+0` / `Ctrl+Alt+0`.
- Quick switcher: `Cmd+Option+Space` / `Ctrl+Alt+Space` — small always-on-top palette; type to fuzzy-search client/project, Enter to start.
- Handle registration failures gracefully (another app may own a shortcut) and show which ones failed in settings.

**Visual design:** Nicholas will provide the visual design. Build with a clean, neutral placeholder style driven by design tokens (CSS variables) in `packages/ui` so the design can be applied later without restructuring components. Support light and dark mode.

---

## 8. Local API (app ↔ Keypad plugin)

- WebSocket server on `127.0.0.1`, default port configurable in settings.
- Auth: the app generates a random token stored in its app data folder; clients send it in the first message. Reject unauthenticated connections.
- JSON messages. Keep the canonical definition in `docs/protocol.md` and version it (`"v": 1`).

**Client → app commands**

- `hello { token, client: "logi-keypad", v }`
- `start { projectId }`
- `stop {}`
- `toggle { projectId }`
- `openSwitcher {}`
- `getState {}`

**App → client events**

- `state { running: { sessionId, projectId, clientId, startedAt } | null, favorites: [...], totals: { todaySeconds, weekSeconds, unbilledSeconds, unbilledAmounts: [{ currency, cents }] } }`
- Sent on connect, on any change, and at least once per minute. Clients compute live elapsed time from `startedAt` themselves; the app does not push every second.
- `projects { list: [{ id, clientId, name, clientName, color }] }` for plugin configuration pickers.
- `error { code, message }`

---

## 9. MX Keypad plugin (C#, Logi Actions SDK)

Hardware: MX Keypad has 9 LCD keys and page buttons. The plugin is a thin client over the Local API.

**Actions (assignable to keys in Logi Options+):**

- **Project timer** (parameter: which project, chosen from the list the app provides). Idle: project name + color. Running: distinct running style + live elapsed time. Press: toggle.
- **Favorite slot** (parameter: 1–9). Mirrors the hotkey slot so key N and hotkey N always match.
- **Stop.**
- **Today total** / **Week total.**
- **Unbilled** (hours or amount).
- **Quick switcher** (opens the palette in the app).

**Rendering & behavior:**

- Redraw the running key once per second; totals keys once per minute; others only on state change.
- If the app is not reachable: show a clear "Stint offline" key state and retry the connection with backoff.
- Target the .NET version that matches the installed Logi Plugin Service; verify at build time.
- Use the SDK's dev link/hot-reload workflow during development.

The C# plugin should stay small. Include clear comments, since the owner is new to C#.

---

## 10. Future: accounts, sync, PWA

- Sync layer on top of the local database, using the sync-ready fields in §5. Last-write-wins per record by `updatedAt`, soft deletes propagate, running-timer conflicts resolved per §6. Device-local settings never sync.
- Web app in `apps/web` reuses `packages/ui` and `packages/core`, built as a responsive PWA: installable to the home screen, offline app shell, notifications (e.g. long-running timer).
- Desktop is the fully offline machine; the PWA is a usually-online companion.
- Backend choice is deferred; do not couple core logic to any specific provider.

---

## 11. Distribution & updates

- **Builds:** GitHub Actions runs on GitHub-hosted macOS and Windows runners. Pushing a version tag (`v*`) builds installers for both platforms and uploads them to a draft GitHub Release, which the owner publishes manually.
  - macOS: separate DMGs for Apple Silicon (arm64) and Intel (x64).
  - Windows: NSIS installer (x64).
- **Signing:** builds are unsigned for now. Windows shows a SmartScreen warning on first install; macOS requires "Open Anyway" in System Settings → Privacy & Security after each install. Revisit signing/notarization later (Apple Developer Program, Windows code-signing certificate).
- **Windows updates:** electron-updater reads the GitHub Release, downloads in the background, and installs on next restart.
- **macOS updates:** silent install requires a signed app, so Stint checks the latest GitHub Release on launch and once a day, and if newer, shows a dialog that opens the matching DMG download in the browser.

---

## 12. Build phases

1. **Core desktop app** — monorepo scaffold, CI + release workflow, Electron app on macOS + Windows, SQLite with sync-ready schema, clients/projects/sessions CRUD, start/stop/switch, session log, editing (times, move, split, manual, delete), totals, CSV export, idle detection, long-running nudge, update check (§11).
2. **Tray/menu bar + global hotkeys** — favorites, stop, quick switcher.
3. **Billing batches** — create, lock, unlock, mark paid, billing views, `billedRateCents`.
4. **Local API + MX Keypad plugin** — WebSocket server, `docs/protocol.md`, C# plugin with the actions above.
5. **Accounts + sync.**
6. **PWA web app.**

### Phase 1 acceptance criteria

- Installs and runs on both macOS and Windows, from installers built by GitHub Actions.
- Can create clients and projects, start/stop/switch timers, and only one timer ever runs.
- A running timer survives quitting and reopening the app.
- Sessions can be edited, moved, split, added manually, and deleted.
- Totals by day/week/range and by client/project are correct, including a running session and sessions crossing midnight.
- CSV export works.
- Windows auto-updates from a GitHub Release; macOS prompts to download a newer release.
- Core logic in `packages/core` has unit tests (time math, totals, split, overlap detection, rate resolution).

---

## 13. License & public repository

Stint is open source under **GPL-3.0-or-later** and hosted publicly at `github.com/nlucaccioni/stint`.

- `LICENSE` at the repo root contains the full, unmodified GPL-3.0 text.
- SPDX header in source files: `// SPDX-License-Identifier: GPL-3.0-or-later`.
- `"license": "GPL-3.0-or-later"` in every `package.json`.
- **Dependency compatibility:** only add dependencies whose licenses are GPL-3.0-compatible (MIT, BSD, ISC, Apache-2.0, MPL-2.0, LGPL, GPL are fine). Flag anything else before adding it. CI runs a license check.
- **Keypad plugin:** licensed **MIT**, separately from the app. It is a separate program that talks to Stint only over the WebSocket protocol, so it is not a derivative of the GPL app, and MIT lets it link with Logitech's proprietary `PluginApi.dll` without a GPL exception. `plugins/logi-keypad/LICENSE` holds the MIT text and plugin files use `// SPDX-License-Identifier: MIT`. Never commit Logitech's DLLs or other SDK binaries; reference them from the local Logi Options+ install at build time.
- **Future sync server (Phase 5):** may be licensed AGPL-3.0 (compatible with GPL-3.0) if protection against closed hosted forks is wanted. Decide then.
- **App stores:** GPL conflicts with Mac App Store terms. If store distribution is ever wanted, outside contributions would need a CLA so the owner can dual-license.
- **Repo hygiene:** no secrets in git. Future sync/backend credentials live in `.env` files that are gitignored, with a committed `.env.example`. The local API token is generated at runtime and stored in the user's app data folder, never in the repo.
- README includes what Stint is, screenshots (later), build instructions for macOS and Windows, the license, and a note that Logitech, Logi, and MX Keypad are trademarks of Logitech and Stint is not affiliated with or endorsed by Logitech.

---

## 14. Open questions

- Partial payments on a billing batch: needed eventually?
- Rounding rules for billing (e.g. nearest 6 or 15 minutes): desired, and applied per session or per batch total?
- Default currency (USD assumed) — confirm.
- Should non-billable time appear in billing views at all?
- Sync backend choice (Phase 5).
- Code signing for macOS/Windows: if and when.
