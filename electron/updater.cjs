// App updates from GitHub Releases.
//
// Windows and Linux download the update in the background and install it on
// restart. macOS refuses to install updates for apps that aren't code-signed,
// so on Mac we only check and send the teacher to the website to download the
// new version. (Once the Mac build is signed, set MANUAL_DOWNLOAD to false
// there and Mac updates install automatically too.)
const { app, BrowserWindow, shell } = require('electron');

const DOWNLOAD_PAGE = 'https://blackhargaan.github.io/Teacherplanner/#download';
const MANUAL_DOWNLOAD = process.platform === 'darwin';
const RECHECK_HOURS = 6;

/**
 * state: 'unsupported' (not an installed build) | 'idle' | 'checking' |
 *        'up-to-date' | 'available' (manual download) | 'downloading' |
 *        'ready' | 'error'
 */
let status = { state: 'idle', currentVersion: app.getVersion(), manualDownload: MANUAL_DOWNLOAD };
let updater = null;

function setStatus(patch) {
  status = { ...status, ...patch, currentVersion: app.getVersion(), manualDownload: MANUAL_DOWNLOAD };
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', status);
}

function getUpdater() {
  if (updater || !app.isPackaged) return updater;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch {
    return null;
  }
  updater.autoDownload = !MANUAL_DOWNLOAD;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => setStatus({ state: 'checking', message: undefined }));
  updater.on('update-not-available', () => setStatus({ state: 'up-to-date', checkedAt: Date.now() }));
  updater.on('update-available', (info) => setStatus({
    state: MANUAL_DOWNLOAD ? 'available' : 'downloading',
    version: info.version,
    percent: 0,
    checkedAt: Date.now(),
  }));
  updater.on('download-progress', (p) => setStatus({ state: 'downloading', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }));
  updater.on('error', (err) => {
    // A failed background download still leaves the website as a way to update.
    setStatus({ state: 'error', message: String(err?.message || err).split('\n')[0] });
  });
  return updater;
}

async function check() {
  const u = getUpdater();
  if (!u) {
    setStatus({ state: 'unsupported' });
    return status;
  }
  // Don't restart a download that's already under way or finished.
  if (status.state === 'downloading' || status.state === 'ready' || status.state === 'checking') return status;
  try {
    await u.checkForUpdates();
  } catch (err) {
    setStatus({ state: 'error', message: String(err?.message || err).split('\n')[0] });
  }
  return status;
}

function install() {
  const u = getUpdater();
  if (u && status.state === 'ready') {
    // Closing the windows first lets each one save the planner (beforeunload).
    setImmediate(() => u.quitAndInstall(false, true));
    return true;
  }
  return false;
}

function openDownloadPage() {
  shell.openExternal(DOWNLOAD_PAGE);
}

/** Check shortly after launch and every few hours while the app stays open. */
function startBackgroundChecks() {
  if (!app.isPackaged) {
    status = { ...status, state: 'unsupported' };
    return;
  }
  setTimeout(check, 5000);
  setInterval(check, RECHECK_HOURS * 60 * 60 * 1000);
}

module.exports = {
  check,
  install,
  openDownloadPage,
  startBackgroundChecks,
  getStatus: () => status,
};
