# Stint Local API — protocol v1

The Local API lets programs on the same computer (the MX Keypad plugin, scripts)
control Stint's timer and read its totals. This file is the source of truth for
its messages; the app (`apps/desktop/src/main/local-api/`) and the Keypad plugin
(`plugins/logi-keypad/`) follow it.

## Connecting

- WebSocket on `ws://127.0.0.1:<port>/`. Stint only listens on the loopback
  address, so nothing on the network can reach it.
- The port and token live in `local-api.json` in Stint's data folder:

  | OS      | Path                                                 |
  | ------- | ---------------------------------------------------- |
  | Windows | `%APPDATA%\Stint\local-api.json`                     |
  | macOS   | `~/Library/Application Support/Stint/local-api.json` |

  Development builds use a `Stint Dev` folder instead of `Stint`. A client that
  supports both should use whichever file was modified most recently.

  ```json
  { "v": 1, "enabled": true, "port": 47823, "token": "3f9c…" }
  ```

  The file is only readable by the user's own account. Read it again before
  every connection attempt: the user can change the port or regenerate the
  token at any time. When `enabled` is false, Stint isn't listening.

- Browsers can't connect: Stint refuses any connection that sends an `Origin`
  header, which browsers always send and other programs don't. This stops a web
  page from guessing at the token.

## Messages

Every message is one JSON object (a text frame) with a `type`. Messages are
small; anything over 64 KB closes the connection. Unknown fields are ignored, so
later versions can add fields without breaking older clients.

### Handshake

The first message must be `hello`, within 5 seconds of connecting:

```json
{ "type": "hello", "token": "3f9c…", "client": "logi-keypad", "v": 1 }
```

- `client`: a short name for logs and the Settings screen (1–50 characters).
- `v`: the protocol version the client speaks. This document is version 1.

On success Stint replies with `state`, then `projects`. On failure it sends an
`error` and closes the connection:

| Close code | Error code            | Meaning                                           |
| ---------- | --------------------- | ------------------------------------------------- |
| 4001       | `unauthorized`        | Wrong token, or the first message wasn't `hello`. |
| 4002       | `unsupported-version` | Stint doesn't speak the client's `v`.             |
| 4008       | `hello-timeout`       | No `hello` within 5 seconds.                      |

Stint also closes connections with code 4003 when the user regenerates the token
or turns the Local API off, and 1001 when Stint quits. Clients should reconnect
with backoff (e.g. 1 s, 2 s, 4 s … up to 30 s), re-reading `local-api.json` each
time.

### Client → Stint commands

| Message                                  | Does                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `{ "type": "start", "projectId": "…" }`  | Start this project's timer, switching from any other. No-op if it's running. |
| `{ "type": "stop" }`                     | Stop the running timer. No-op if none is running.                            |
| `{ "type": "toggle", "projectId": "…" }` | Stop the project if it's running, otherwise start/switch to it.              |
| `{ "type": "openSwitcher" }`             | Open Stint's quick switcher on screen.                                       |
| `{ "type": "getState" }`                 | Reply with `state`.                                                          |
| `{ "type": "getProjects" }`              | Reply with `projects`.                                                       |

Any command may include an `"id"` string (up to 100 characters). If the command
fails, the `error` reply echoes it, so a client can tell which command failed.
Commands that succeed don't get a direct reply: the change arrives as `state`,
which every connected client receives.

### Stint → client events

#### `state`

Sent after `hello`, whenever the timer, sessions, favorites, or settings change,
and at least once a minute.

```json
{
  "type": "state",
  "running": {
    "sessionId": "0193…",
    "projectId": "0192…",
    "clientId": "0192…",
    "startedAt": 1761487200000,
    "billable": true,
    "rate": { "currency": "USD", "cents": 15000 }
  },
  "favorites": ["0192…", null, null, null, null, null, null, null, null],
  "totals": {
    "todaySeconds": 5400,
    "weekSeconds": 61200,
    "unbilledSeconds": 183600,
    "unbilledAmounts": [{ "currency": "USD", "cents": 510000 }]
  }
}
```

- `running`: the running timer, or `null`. `startedAt` is UTC epoch
  milliseconds. Stint doesn't send a message every second: clients compute the
  live elapsed time as `now - startedAt` themselves.
  - `billable`: whether this time counts toward unbilled time.
  - `rate`: its hourly rate (the project's, or else the client's), or `null`
    when there's none.
  - Added after v1 was first written: clients should treat both as optional.
- `favorites`: the nine favorite slots (index 0 = slot 1), each a project id or
  `null`. These match the global hotkeys, so slot N on the Keypad and hotkey N
  always do the same thing. Look up names and colors in `projects`; a favorite
  that isn't listed there (archived) should show as empty.
- `totals`, all including the running timer up to the moment of sending:
  - `todaySeconds` / `weekSeconds`: all recorded time today / this week, in the
    user's time zone and week start day.
  - `unbilledSeconds`: billable time not yet in a billing batch.
  - `unbilledAmounts`: the value of that time, one entry per currency (amounts
    in different currencies are never added together). Empty when no rates are
    set. `cents` is in the currency's minor unit.

  Totals go stale between messages. A client can keep them live by adding the
  seconds since the last `state` while a timer runs: to `todaySeconds` and
  `weekSeconds` always, and, when `running.billable`, to `unbilledSeconds`,
  plus `seconds × rate.cents / 3600` to the `unbilledAmounts` entry in
  `rate.currency`.

#### `projects`

Sent after `hello`, whenever clients or projects change, and in reply to
`getProjects`. Lists active (non-archived) projects of active clients, in the
user's order.

```json
{
  "type": "projects",
  "list": [
    {
      "id": "0192…",
      "clientId": "0192…",
      "name": "Website Redesign",
      "clientName": "Acme",
      "color": "#336699"
    }
  ]
}
```

`color` is the client's color as `#rrggbb`.

#### `error`

```json
{ "type": "error", "code": "not-found", "message": "Project not found.", "id": "42" }
```

- `code`: one of the handshake codes above, `invalid-message` (not JSON, or not
  a known command with the right fields), `internal` (a bug in Stint), or a rule
  Stint enforces, such as `not-found` (no such project) or `archived` (can't
  start an archived project).
- `message`: a human-readable explanation, fine to show on a key.
- `id`: echoed from the command, when it had one.

Errors after the handshake don't close the connection.

## Versioning

The `v` in `hello` is the protocol version. Adding message types or fields
doesn't change it; removing or changing the meaning of anything does. Stint
replies `unsupported-version` to versions it doesn't speak.
