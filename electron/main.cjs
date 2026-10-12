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
  const tmp = `${dataPath()}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, dataPath());
  lastWrittenMtime = fs.statSync(dataPath()).mtimeMs;
  backupToday(json);
}

function backupToday(json) {
  const dir = path.join(vaultPath, 'backups');
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `planner-${day}.json`);
  if (fs.existsSync(file)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, json);
  const old = fs.readdirSync(dir).filter((f) => /^planner-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -BACKUP_DAYS);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
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

ipcMain.handle('vault:info', () => vaultInfo());

ipcMain.handle('vault:choose', async (_e, mode) => {
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
  setVault(dir);
  return vaultInfo();
});

ipcMain.handle('vault:load', () => {
  if (!vaultPath || !fs.existsSync(dataPath())) return null;
  lastWrittenMtime = fs.statSync(dataPath()).mtimeMs;
  return fs.readFileSync(dataPath(), 'utf8');
});

// Other open windows (e.g. a shared view) reload after each save.
const tellOthers = (sender) => {
  for (const w of BrowserWindow.getAllWindows()) if (w.webContents !== sender) w.webContents.send('vault:changed');
};
ipcMain.handle('vault:save', (e, json) => { writeData(json); tellOthers(e.sender); return true; });
// Used when the window is closing so the last edit is never lost.
ipcMain.on('vault:save-sync', (e, json) => {
  try { if (vaultPath) { writeData(json); tellOthers(e.sender); } e.returnValue = true; } catch { e.returnValue = false; }
});

ipcMain.handle('vault:save-attachment', (_e, { name, data }) => {
  const dir = path.join(vaultPath, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  const file = uniqueName(dir, name);
  fs.writeFileSync(path.join(dir, file), Buffer.from(data));
  return `attachments/${file}`;
});

ipcMain.handle('vault:open-path', (_e, rel) => shell.openPath(rel ? insideVault(rel) : vaultPath));

ipcMain.handle('update:status', () => updates.getStatus());
ipcMain.handle('update:check', () => updates.check());
ipcMain.handle('update:install', () => updates.install());
ipcMain.handle('update:download-page', () => updates.openDownloadPage());

// ---------------------------------------------------------------- window

function isInternal(url) {
  return url.startsWith('file:') || (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL));
}

function createWindow(hash = '') {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    title: 'Teacher Planner',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('vault://')) {
      const rel = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
      shell.openPath(insideVault(rel));
      return { action: 'deny' };
    }
    if (isInternal(url)) {
      // e.g. "Open view" – a read-only shared view in its own window
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true } } };
    }
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternal(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
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
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Check for Updates…', click: checkFromMenu },
        { label: 'Teacher Planner Website', click: () => shell.openExternal('https://blackhargaan.github.io/Teacherplanner/') },
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
