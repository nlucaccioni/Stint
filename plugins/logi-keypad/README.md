# Stint for MX Keypad

A Logi Options+ plugin that puts [Stint](../../README.md) on the Logitech MX Keypad: start and stop timers with one press, see what's running, and keep an eye on today's and unbilled time.

It talks to the Stint desktop app over Stint's Local API (on your computer only), so Stint needs to be running.

## Keys

In Logi Options+, open the MX Keypad, choose a key, and look under **Stint Actions**.

| Key                                                           | Shows                                                                                            | Press                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Projects → _client_ → _project_**                           | The project's name and its client's color; while it runs, filled with the color and counting up. | Start, switch to, or stop that project.    |
| **Projects → All Projects**                                   | "All Projects".                                                                                  | Opens a page with a key for every project. |
| **Timer → Now Running**                                       | The running project with its time, or "No Timer".                                                | Stop the timer.                            |
| **Timer → Quick Switcher**                                    | "Quick Switcher".                                                                                | Opens Stint's quick switcher.              |
| **Totals → Today, This Week, Unbilled Time, Unbilled Amount** | The total, counting up while a billable timer runs.                                              | Nothing.                                   |

Projects follow Stint: new, renamed, and archived projects update in Options+ by themselves.

## Install

Requirements:

- [Logi Options+](https://www.logitech.com/software/logi-options-plus.html) with Logi Plugin Service 6.4 or newer, and an MX Keypad.
- Stint with the Local API: **Settings → MX Keypad → Allow the MX Keypad Plugin to Connect** (on by default).

Then double-click `Stint_<version>.lplug4`. Logi Options+ installs it. The plugin finds Stint by itself; there's nothing to configure.

Built and tested on Windows. The macOS paths are in place but haven't been tested yet.

## Troubleshooting

- **Keys say "Stint Offline":** Stint isn't running, or hasn't finished starting. Keys come back on their own within 30 seconds of Stint starting.
- **Keys say "Keypad Off in Stint":** turn on **Allow the MX Keypad Plugin to Connect** in Stint's Settings.
- **A key stopped updating:** its icon was edited in Logi Options+. Editing any Stint key's icon (even just hiding its text) makes Options+ save a still picture of it and stop asking the plugin for new ones. Stint's keys are set up so Options+ normally doesn't offer editing, but if it happens, quit Logi Options+, delete the key's `$Stint___….ict` file from the profile's `ActionIcons` folder, and reopen Options+:
  - Windows: `%LOCALAPPDATA%\Logi\LogiPluginService\Applications\<device>\<app>\Profiles\<profile>\ActionIcons`
- **The All Projects key shows an old look:** Options+ saves a picture of a folder key the first time it draws it and keeps using that picture. After changing the key's design, delete `$Stint___#DynamicFolder___DynamicFolder#Loupedeck.StintPlugin.ProjectsFolder.ict` from the same `ActionIcons` folder; Options+ saves the new look the next time it shows the key.
- **Something else:** the plugin's log is at `%LOCALAPPDATA%\Logi\LogiPluginService\Logs\plugin_logs\Stint.log` (Windows).

## Development

The plugin is a small C# program. Requirements:

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). Logi Plugin Service 6.4 runs plugins on its own bundled .NET 10, so the plugin targets `net10.0`.
- LogiPluginTool: `dotnet tool install --global LogiPluginTool` (6.4 or newer).
- Logi Options+ installed: the build references its `PluginApi.dll` and `SkiaSharp.dll` in place. They're never copied into the build or the repo.

```sh
dotnet build                 # build, link into Logi Options+, and reload the plugin
dotnet test tests            # run the tests (no Logi Options+ needed)
```

`dotnet build` (Debug) writes a `StintPlugin.link` file into the Logi Plugin Service's `Plugins` folder that points at `bin/Debug`, so Options+ loads the plugin straight from this folder and reloads it after each build. For automatic rebuilds on save, run `dotnet watch build` in `src`. `dotnet clean` removes the link.

Run Stint's development build (`pnpm dev` at the repo root) to have something to connect to.

### How it works

- `src/Connection/` talks to Stint. It reads the port and token from `local-api.json` in Stint's data folder (the most recently written of `Stint` and `Stint Dev`), connects, and keeps the latest state and project list, reconnecting with backoff. Messages are defined in [docs/protocol.md](../../docs/protocol.md). No Logitech code, so it's unit-tested.
- `src/Actions/` has one class per key. `src/Display/` draws them: `KeyArt.cs` holds every color and size, `TextLayout.cs` wraps text (tested), `Format.cs` formats times and money (tested).
- The plugin saves the last project list to its data folder, so project keys keep their projects while Stint isn't running.

Options+ behaviour that shaped the design (also in [SPEC.md](../../SPEC.md) §9):

- Keys are widgets with a blank name, so Options+ shows the plugin's image as is, without its own text or icon editing.
- Per-key choices (the project list) only appear in Options+ when the action uses the SDK's parameterless constructor and adds its choices in the constructor.
- Options+ draws a folder's own keys inset on a grey tile, so the All Projects page is made of Project keys instead.
- Dropdown ("Action Editor") actions never get live images on the MX Keypad, so the plugin doesn't use them.

### Packaging

```sh
dotnet build src -c Release
logiplugintool pack ./bin/Release/ ./Stint_0_1.lplug4
logiplugintool verify ./Stint_0_1.lplug4
```

Name the file `Stint_<version>.lplug4`, with the version from `src/package/metadata/LoupedeckPackage.yaml`. To try it as an installed plugin, run `dotnet clean` first (so the development link doesn't load a second copy), then double-click the package. `.lplug4` files are gitignored.

## License

MIT, separately from the rest of Stint (GPL-3.0-or-later). See [LICENSE](LICENSE). The plugin is its own program that talks to Stint only over the Local API.

The plugin bundles the Space Grotesk font (`src/Fonts`, converted to TrueType from the fontsource package), licensed under the SIL Open Font License 1.1; see [src/package/licenses](src/package/licenses).

Logitech, Logi, Logi Options+, and MX Keypad are trademarks of Logitech. This plugin is not affiliated with or endorsed by Logitech.
