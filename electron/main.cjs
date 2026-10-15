// Desktop shell. Like Obsidian, all data lives in an ordinary folder the
// teacher chooses (the "planner folder"):
//   planner.json   – classes, lessons, grades… (plain JSON)
//   attachments/   – files attached to lessons
//   backups/       – one automatic copy per day, last 30 kept
// Putting the folder in OneDrive / Google Drive / Dropbox syncs it between
// computers.
const { app, BrowserWindow, dialog, ipcMain, protocol, net, shell, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const updates = require('./updater.cjs');
const {
  BACKUP_NAME, backupBeforeSave, beforeRestoreName, copyMissingFiles, isAppUrl, setAsideDamaged,
} = require('./vaultFiles.cjs');

const DATA_FILE = 'planner.json';
const BACKUP_DAYS = 30;

protocol.registerSchemesAsPrivileged([
  { scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

let vaultPath = null;
let mainWindow = null;
let lastWrittenMtime = 0;

function defaultVault() {
  // Some Linux desktops report the home folder as "documents".
  let docs = app.getPath('documents');
  if (docs === app.getPath('home')) docs = path.join(docs, 'Documents');
  return path.join(docs, 'Teacher Planner');
}
const dataPath = () => path.join(vaultPath, DATA_FILE);

function prepareVault(dir) {
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  const readme = path.join(dir, 'README.txt');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      'This folder holds your Teacher Planner data.',
      '',
      'planner.json  - your classes, lessons, grades and settings',
      'attachments/  - files attached to lessons',
      'backups/      - automatic daily backups (the last 30 days)',
      '',
      'To restore a backup: quit Teacher Planner, copy a file from backups/',
      'over planner.json, and start the app again.',
      'To use the planner on another computer, keep this folder in OneDrive,',
      'Google Drive or Dropbox and choose it when the app first starts.',
      '',
    ].join('\n'));
  }
}

function setVault(dir) {
  prepareVault(dir);
  vaultPath = dir;
  writeConfig({ ...readConfig(), vaultPath: dir });
  watchDataFile();
}

function vaultInfo() {
  return {
    vaultPath,
    defaultPath: defaultVault(),
    hasData: !!vaultPath && fs.existsSync(dataPath()),
    version: app.getVersion(),
  };
}

// Atomic write: never leave a half-written planner.json behind.
function writeData(json) {
  try {
    // Before the first save of the day, keep planner.json as it was (so
    // restoring "Tuesday" brings back the planner from before Tuesday's changes).
    backupBeforeSave(dataPath(), path.join(vaultPath, 'backups'), BACKUP_DAYS);
  } catch (err) {
    console.error('Daily backup failed:', err); // still save the teacher's work
  }
  const tmp = `${dataPath()}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, dataPath());
  lastWrittenMtime = fs.statSync(dataPath()).mtimeMs;
}

/** Daily backups plus the safety copies taken before a restore, newest first. */
function listBackups() {
  const dir = path.join(vaultPath, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((file) => ({ file, m: file.match(BACKUP_NAME) }))
    .filter((x) => x.m)
    .map(({ file, m }) => {
      const st = fs.statSync(path.join(dir, file));
      return { file, date: m[1], beforeRestore: !!m[2], size: st.size, savedAt: st.mtimeMs };
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

// Notice when planner.json changes underneath us (e.g. synced from another PC).
let watched = null;
function watchDataFile() {
  if (watched) fs.unwatchFile(watched);
  watched = dataPath();
  fs.watchFile(watched, { interval: 2000 }, (cur) => {
    if (!cur.mtimeMs || Math.abs(cur.mtimeMs - lastWrittenMtime) < 1) return;
    lastWrittenMtime = cur.mtimeMs;
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('vault:changed');
  });
}

function insideVault(rel) {
  const full = path.resolve(vaultPath, rel);
  if (!full.startsWith(path.resolve(vaultPath) + path.sep)) throw new Error('Path outside planner folder');
  return full;
}

function uniqueName(dir, name) {
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || 'file';
  const ext = path.extname(safe);
  const base = path.basename(safe, ext);
  let candidate = safe;
  for (let i = 2; fs.existsSync(path.join(dir, candidate)); i += 1) candidate = `${base} (${i})${ext}`;
  return candidate;
}

// ---------------------------------------------------------------- IPC

// The app's own page. Nothing else (a stray file:// page, a web page) may use
// the planner bridge or open in an app window.
const APP_INDEX_URL = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const isAppPage = (url) => isAppUrl(url, APP_INDEX_URL, process.env.VITE_DEV_SERVER_URL);

function fromApp(e) {
  const url = e.senderFrame?.url;
  if (url && isAppPage(url)) return true;
  console.warn('Blocked a request from a page that is not Teacher Planner:', url);
  return false;
}
// Same as ipcMain.handle / ipcMain.on, but only answer the app's own page.
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromApp(e)) throw new Error('Not allowed');
    return fn(e, ...args);
  });
}
function on(channel, fn) {
  ipcMain.on(channel, (e, ...args) => {
    if (!fromApp(e)) { e.returnValue = false; return; }
    fn(e, ...args);
  });
}

handle('vault:info', () => vaultInfo());

// Choosing a folder only looks at it; nothing is switched until the page
// calls vault:use (after asking "Switch to it?" when the folder already has a
// planner), so cancelling can never leave saves going to the other folder.
let chosenFolder = null;
handle('vault:choose', async (_e, mode) => {
  let dir = defaultVault();
  if (mode === 'pick') {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder for your planner',
      buttonLabel: 'Use this folder',
      defaultPath: vaultPath || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    [dir] = res.filePaths;
  }
  chosenFolder = dir;
  return { path: dir, hasData: fs.existsSync(path.join(dir, DATA_FILE)) };
});

// Switch to the folder just chosen. With { move: true } the planner is being
// moved there, so its attachments come along (files already there are kept).
handle('vault:use', (_e, dir, opts = {}) => {
  if (!dir || dir !== chosenFolder) throw new Error('Choose the folder first');
  const from = vaultPath;
  setVault(dir);
  chosenFolder = null;
  let attachments = null;
  if (opts.move && from && path.resolve(from) !== path.resolve(dir)) {
    attachments = copyMissingFiles(path.join(from, 'attachments'), path.join(dir, 'attachments'));
  }
  return { ...vaultInfo(), attachments };
});

// planner.json couldn't be read: rename it (never delete it) so the teacher can
// start over or restore a backup without losing the damaged copy.
handle('vault:set-aside-damaged', () => {
  if (!vaultPath) return null;
  return setAsideDamaged(dataPath());
});

handle('vault:load', () => {
  if (!vaultPath || !fs.existsSync(dataPath())) return null;
  lastWrittenMtime = fs.statSync(dataPath()).mtimeMs;
  return fs.readFileSync(dataPath(), 'utf8');
});

// Other open windows (e.g. a shared view) reload after each save.
const tellOthers = (sender) => {
  for (const w of BrowserWindow.getAllWindows()) if (w.webContents !== sender) w.webContents.send('vault:changed');
};
handle('vault:save', (e, json) => { writeData(json); tellOthers(e.sender); return true; });
// Used when the window is closing so the last edit is never lost.
on('vault:save-sync', (e, json) => {
  try { if (vaultPath) { writeData(json); tellOthers(e.sender); } e.returnValue = true; } catch { e.returnValue = false; }
});

handle('vault:list-backups', () => (vaultPath ? listBackups() : []));
handle('vault:read-backup', (_e, file) => {
  if (!BACKUP_NAME.test(file)) throw new Error('Not a backup file');
  return fs.readFileSync(path.join(vaultPath, 'backups', file), 'utf8');
});
// Keep a copy of the current planner before it's replaced by a backup.
handle('vault:snapshot-before-restore', () => {
  if (!vaultPath || !fs.existsSync(dataPath())) return null;
  const file = beforeRestoreName();
  fs.copyFileSync(dataPath(), path.join(vaultPath, 'backups', file));
  const extra = listBackups().filter((b) => b.beforeRestore).slice(10);
  for (const b of extra) fs.rmSync(path.join(vaultPath, 'backups', b.file), { force: true });
  return file;
});

// Save the page that asked (a printable plan) as a PDF.
const LETTER_COUNTRIES = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'PR']);
let lastPdf = null;
handle('pdf:save', async (e, fileName) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const safe = String(fileName || 'Teacher Planner.pdf').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  const res = await dialog.showSaveDialog(win, {
    title: 'Save as PDF',
    defaultPath: path.join(app.getPath('documents'), safe),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return null;
  const pdf = await e.sender.printToPDF({
    printBackground: true,
    pageSize: LETTER_COUNTRIES.has(app.getLocaleCountryCode()) ? 'Letter' : 'A4',
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  });
  fs.writeFileSync(res.filePath, pdf);
  lastPdf = res.filePath;
  return res.filePath;
});
handle('pdf:open-last', () => lastPdf && shell.openPath(lastPdf));

handle('vault:save-attachment', (_e, { name, data }) => {
  const dir = path.join(vaultPath, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  const file = uniqueName(dir, name);
  fs.writeFileSync(path.join(dir, file), Buffer.from(data));
  return `attachments/${file}`;
});

handle('vault:open-path', (_e, rel) => shell.openPath(rel ? insideVault(rel) : vaultPath));

// District calendars (.ics links). Fetched here rather than in the page,
// because calendar servers don't allow cross-site requests from browsers.
const CALENDAR_MAX_BYTES = 15 * 1024 * 1024;
handle('calendar:fetch', async (_e, url) => {
  const target = new URL(String(url));
  if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Only web links can be imported.');
  const res = await net.fetch(target.toString(), { signal: AbortSignal.timeout(15000), headers: { Accept: 'text/calendar, */*' } });
  if (!res.ok) throw new Error(`The calendar couldn’t be downloaded (error ${res.status}). Check that it’s shared publicly.`);
  const body = await res.arrayBuffer();
  if (body.byteLength > CALENDAR_MAX_BYTES) throw new Error('That calendar is too large to import.');
  return new TextDecoder('utf-8').decode(body);
});

handle('update:status', () => updates.getStatus());
handle('update:check', () => updates.check());
handle('update:install', () => updates.install());
handle('update:download-page', () => updates.openDownloadPage());

// ---------------------------------------------------------------- window

const PRELOAD = path.join(__dirname, 'preload.cjs');

// Every window (the main one and "Open view" windows) gets the same rules:
// only the app's own page loads inside it; web links open in the browser.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('vault://')) {
      try {
        const rel = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
        shell.openPath(insideVault(rel));
      } catch (err) {
        console.warn('Could not open attachment:', err.message);
      }
      return { action: 'deny' };
    }
    if (isAppPage(url)) {
      // e.g. "Open view" – a read-only shared view in its own window
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false } } };
    }
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const stayInApp = (e, url) => {
    if (isAppPage(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  };
  contents.on('will-navigate', stayInApp);
  contents.on('will-redirect', stayInApp);
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

function createWindow(hash = '') {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    title: 'Teacher Planner',
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL + hash);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: hash.replace(/^#/, '') });
  return win;
}

// Show Settings → Updates and run a check there, so the result is visible.
function checkFromMenu() {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
  if (win) {
    win.show();
    win.webContents.send('app:navigate', 'settings/updates');
  }
  updates.check();
}

function sendCommand(cmd) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.webContents.send('app:command', cmd);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Planner Folder', click: () => vaultPath && shell.openPath(vaultPath) },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => BrowserWindow.getFocusedWindow()?.webContents.print() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Undo/Redo act on the planner, or on the text box being typed in.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendCommand('undo') },
        { label: 'Redo', accelerator: process.platform === 'win32' ? 'Ctrl+Y' : 'Shift+CmdOrCtrl+Z', click: () => sendCommand('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find Lessons…', accelerator: 'CmdOrCtrl+F', click: () => sendCommand('find') },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Getting Started Tour', click: () => sendCommand('tour') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: checkFromMenu },
        { label: 'Teacher Planner Website', click: () => shell.openExternal('https://teachertechtools.org/teacher-planner.html') },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  protocol.handle('vault', (req) => {
    try {
      const rel = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
      return net.fetch(pathToFileURL(insideVault(rel)).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  const cfg = readConfig();
  if (cfg.vaultPath && fs.existsSync(cfg.vaultPath)) {
    vaultPath = cfg.vaultPath;
    watchDataFile();
  }

  buildMenu();
  mainWindow = createWindow();

  updates.startBackgroundChecks();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
