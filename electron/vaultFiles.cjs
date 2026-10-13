// File-name and folder helpers for the planner folder. Kept free of Electron
// so they can be tested on their own (tests/vault-files.test.js).
const fs = require('node:fs');
const path = require('node:path');

const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the computer's own time zone (toISOString would give the UTC date). */
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HHMMSS in the computer's own time zone. */
function localTime(d = new Date()) {
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Daily backups and the safety copies taken before a restore. */
const BACKUP_NAME = /^planner-(\d{4}-\d{2}-\d{2})(?:-before-restore-(\d{6}))?\.json$/;
const DAILY_BACKUP = /^planner-\d{4}-\d{2}-\d{2}\.json$/;

const dailyBackupName = (d = new Date()) => `planner-${localDay(d)}.json`;
const beforeRestoreName = (d = new Date()) => `planner-${localDay(d)}-before-restore-${localTime(d)}.json`;
/** Where a planner.json that couldn't be read is set aside before starting over. */
const damagedName = (d = new Date()) => `planner.json.damaged-${localDay(d)}-${localTime(d)}`;

/** Daily backups beyond the newest `keep`, oldest first. */
function dailyBackupsToRemove(files, keep) {
  const daily = files.filter((f) => DAILY_BACKUP.test(f)).sort();
  return daily.slice(0, Math.max(0, daily.length - keep));
}

/**
 * Before the first save of a day, copy planner.json as it is now (the state
 * before today's changes) to backups/planner-<today>.json, then prune old
 * daily backups. A file that isn't valid JSON isn't copied. Returns the
 * backup's file name, or null when none was made.
 */
function backupBeforeSave(dataFile, backupsDir, keep, d = new Date()) {
  const name = dailyBackupName(d);
  const file = path.join(backupsDir, name);
  if (fs.existsSync(file) || !fs.existsSync(dataFile)) return null;
  const current = fs.readFileSync(dataFile, 'utf8');
  try { JSON.parse(current); } catch { return null; }
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.writeFileSync(file, current);
  for (const f of dailyBackupsToRemove(fs.readdirSync(backupsDir), keep)) fs.rmSync(path.join(backupsDir, f), { force: true });
  return name;
}

/** Rename a planner.json that couldn't be read so starting over never overwrites it. Returns the new name. */
function setAsideDamaged(dataFile, d = new Date()) {
  if (!fs.existsSync(dataFile)) return null;
  const name = damagedName(d);
  fs.renameSync(dataFile, path.join(path.dirname(dataFile), name));
  return name;
}

/**
 * True only for the app's own page: the built index.html (any #route or
 * ?query), or the Vite dev server while developing. Other file:// pages —
 * say a downloaded .html dropped on the window — must never get the
 * planner bridge.
 */
function isAppUrl(url, appIndexUrl, devServerUrl) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (devServerUrl) {
    try { return u.origin === new URL(devServerUrl).origin; } catch { return false; }
  }
  if (u.protocol !== 'file:') return false;
  const bare = `${u.protocol}//${u.host}${u.pathname}`;
  const app = new URL(appIndexUrl);
  const appBare = `${app.protocol}//${app.host}${app.pathname}`;
  // Windows paths aren't case-sensitive (and the drive letter case can vary).
  return process.platform === 'win32' ? bare.toLowerCase() === appBare.toLowerCase() : bare === appBare;
}

/**
 * Copy every file under `from` into `to`, keeping sub-folders and never
 * replacing a file that's already there. Returns what happened so the
 * teacher can be told about anything that couldn't be copied.
 */
function copyMissingFiles(from, to) {
  const result = { copied: 0, skipped: 0, failed: [] };
  if (!fs.existsSync(from)) return result;
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(from, rel), { withFileTypes: true });
    } catch {
      result.failed.push(rel || '.');
      return;
    }
    for (const entry of entries) {
      const r = rel ? path.join(rel, entry.name) : entry.name;
      try {
        if (entry.isDirectory()) {
          fs.mkdirSync(path.join(to, r), { recursive: true });
          walk(r);
        } else if (entry.isFile()) {
          const dest = path.join(to, r);
          if (fs.existsSync(dest)) { result.skipped += 1; continue; }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(path.join(from, r), dest, fs.constants.COPYFILE_EXCL);
          result.copied += 1;
        }
      } catch {
        result.failed.push(r);
      }
    }
  };
  walk('');
  return result;
}

module.exports = {
  localDay,
  BACKUP_NAME,
  dailyBackupName,
  beforeRestoreName,
  damagedName,
  dailyBackupsToRemove,
  backupBeforeSave,
  setAsideDamaged,
  isAppUrl,
  copyMissingFiles,
};
