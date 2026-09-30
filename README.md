# Stint

A local-first desktop time tracker for freelance work, for macOS and Windows.

- Start, stop, and switch timers per client and project.
- Session log with editing: fix times, move, split, add manual entries.
- Totals by day, week, or custom range, grouped by client and project.
- Track what's been billed and paid.
- Global hotkeys, a menu bar / tray timer, and (later) Logitech MX Keypad control.
- Works fully offline. Your data lives in a SQLite database on your machine.

> Stint is in early development. See [SPEC.md](SPEC.md) for the full plan.

## Install

Download the latest installer from [Releases](https://github.com/nlucaccioni/stint/releases).

Builds are not code-signed yet:

- **macOS:** after opening the DMG and moving Stint to Applications, the first launch is blocked. Open **System Settings → Privacy & Security** and click **Open Anyway**.
- **Windows:** SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**.

## Build from source

Requirements:

- [Node.js](https://nodejs.org/) 24 or newer
- [pnpm](https://pnpm.io/) (`npm install -g --allow-scripts=pnpm pnpm`)
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** if the SQLite module fails to install, add [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload

```sh
pnpm install
pnpm dev          # run the app in development mode
pnpm test         # run unit tests
pnpm build        # build installers for the current platform
```

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
