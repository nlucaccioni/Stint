# Stint

A local-first desktop time tracker for freelance work, for macOS and Windows.

- Start, stop, and switch timers per client and project, from the app, the menu bar / tray, or global shortcuts.
- Nine favorite slots and a quick switcher palette to jump between projects from any app.
- Session log with editing: fix times, move, split, add manual entries. Overlaps are flagged.
- Totals by day, week, month, or custom range, grouped by client and project, with amounts per currency.
- Billing batches: bill a client's time with an invoice reference, mark it paid, and see what's outstanding. Billed time is locked and keeps the rate it was billed at. Optional rounding.
- Idle detection (including sleep and screen lock) and a reminder for long-running timers.
- CSV export of any date range.
- Works fully offline. Your data lives in a SQLite database on your machine.

> Stint is in early development, with a placeholder visual design. Logitech MX Keypad support and sync between devices are planned; see [SPEC.md](SPEC.md).

## Install

Download the latest installer from [Releases](https://github.com/nlucaccioni/stint/releases).

Builds are not code-signed yet:

- **macOS:** after opening the DMG and moving Stint to Applications, the first launch is blocked. Open **System Settings → Privacy & Security** and click **Open Anyway**.
- **Windows:** SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**.

## Build from source

Requirements:

- [Node.js](https://nodejs.org/) 24 or newer
- [pnpm](https://pnpm.io/) (`npm install -g --allow-scripts=pnpm pnpm`)

No C++ toolchain is needed: Stint uses the SQLite built into Electron.

```sh
pnpm install
pnpm dev          # run the app in development mode
pnpm test         # run unit tests
pnpm build        # build installers for the current platform
```

Your data lives in `stint.db` in the app data folder: `~/Library/Application Support/Stint` on macOS, `%APPDATA%\Stint` on Windows. `pnpm dev` uses a separate `Stint Dev` folder so development never touches real data.

## Repository layout

| Path                  | Contents                                                       |
| --------------------- | -------------------------------------------------------------- |
| `packages/core`       | Business logic: time math, totals, billing. No UI or Electron. |
| `packages/ui`         | Shared React components and design tokens.                     |
| `apps/desktop`        | The Electron app.                                              |
| `apps/web`            | PWA companion (planned).                                       |
| `plugins/logi-keypad` | MX Keypad plugin (planned).                                    |

## License

Stint is free software, licensed under the [GNU General Public License v3.0 or later](LICENSE).

The MX Keypad plugin in `plugins/logi-keypad` is licensed separately under the MIT License.

Logitech, Logi, and MX Keypad are trademarks of Logitech. Stint is not affiliated with or endorsed by Logitech.
