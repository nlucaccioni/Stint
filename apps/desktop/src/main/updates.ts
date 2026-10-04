// SPDX-License-Identifier: GPL-3.0-or-later
// Update checks (SPEC.md Â§11). Only published GitHub Releases count; drafts are
// invisible to these checks, so a release goes out only when it's published.
//
// - Windows: electron-updater downloads the new installer in the background and
//   installs it when the app quits. Windows shows a notification when it's ready.
// - macOS: installing silently requires a signed, notarized app, which Stint
//   isn't yet. Instead we read the latest release and offer to open its DMG.
import { app, dialog, net, shell } from 'electron'
import electronUpdater from 'electron-updater'

const REPO = 'nlucaccioni/stint'
const FIRST_CHECK_DELAY = 10_000
const CHECK_EVERY = 24 * 60 * 60 * 1000

const check = process.platform === 'darwin' ? checkMac : checkWindows
/** True while a check started from the menu is running, so repeat clicks don't stack. */
let manualCheckRunning = false

/** Start checking for updates in the background (installed builds only). */
export function startUpdateChecks(): void {
  if (!app.isPackaged) return
  const run = () => void check(false).catch((e: unknown) => console.error('[updates]', e))
  setTimeout(run, FIRST_CHECK_DELAY)
  setInterval(run, CHECK_EVERY)
}

/**
 * "Check for updates…" from the app menu. Unlike background checks, this always
 * tells the user the outcome, including "you're up to date" and errors.
 */
export function checkForUpdatesNow(): void {
  if (manualCheckRunning) return
  if (!app.isPackaged) {
    void dialog.showMessageBox({
      type: 'info',
      message: 'Updates are only checked in the installed app',
      detail: 'This is a development build.',
    })
    return
  }
  manualCheckRunning = true
  void check(true)
    .catch((e: unknown) => {
      console.error('[updates]', e)
      void dialog.showMessageBox({
        type: 'warning',
        message: 'Couldn’t check for updates',
        detail: e instanceof Error ? e.message : String(e),
      })
    })
    .finally(() => (manualCheckRunning = false))
}

function showUpToDate(): Promise<unknown> {
  return dialog.showMessageBox({
    type: 'info',
    message: 'Stint is up to date',
    detail: `You have the latest version, ${app.getVersion()}.`,
  })
}

async function checkWindows(manual: boolean): Promise<void> {
  const { autoUpdater } = electronUpdater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  if (!manual) {
    await autoUpdater.checkForUpdatesAndNotify({
      title: 'Stint update ready',
      body: 'Version {version} will be installed when you quit Stint.',
    })
    return
  }

  const result = await autoUpdater.checkForUpdates()
  const latest = result?.updateInfo.version
  if (!result || !latest || !isNewerVersion(latest, app.getVersion())) {
    await showUpToDate()
    return
  }
  // The download starts on its own (autoDownload); offer to restart when it's done.
  void dialog.showMessageBox({
    type: 'info',
    message: `Stint ${latest} is available`,
    detail: 'It’s downloading in the background. You can keep working.',
  })
  await result.downloadPromise
  const { response: button } = await dialog.showMessageBox({
    type: 'info',
    message: `Stint ${latest} is ready to install`,
    detail: 'Restart Stint now to update, or it will update the next time you quit.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })
  if (button === 0) autoUpdater.quitAndInstall()
}

interface Release {
  tag_name: string
  html_url: string
  assets: { name: string; browser_download_url: string }[]
}

async function checkMac(manual: boolean): Promise<void> {
  const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Stint' },
  })
  // 404: nothing published yet.
  const release = response.status === 404 ? null : await readRelease(response)
  const latest = release?.tag_name.replace(/^v/, '')
  if (!release || !latest || !isNewerVersion(latest, app.getVersion())) {
    if (manual) await showUpToDate()
    return
  }

  const dmg = release.assets.find((a) => a.name === `Stint-${latest}-mac-${process.arch}.dmg`)
  const { response: button } = await dialog.showMessageBox({
    type: 'info',
    message: `Stint ${latest} is available`,
    detail: `You have ${app.getVersion()}. Download the new version, then drag it into Applications to replace this one.`,
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })
  if (button === 0) await shell.openExternal(dmg?.browser_download_url ?? release.html_url)
}

async function readRelease(response: Response): Promise<Release> {
  if (!response.ok) throw new Error(`GitHub responded ${response.status}`)
  return (await response.json()) as Release
}

/**
 * True if `latest` is a higher version than `current` ("0.2.0" vs "0.1.9").
 * Compares the numeric major.minor.patch; anything after "-" is ignored.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parts = (v: string) =>
    v
      .replace(/^v/, '')
      .split('-')[0]!
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const a = parts(latest)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}
