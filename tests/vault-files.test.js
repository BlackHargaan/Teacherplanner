import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const {
  BACKUP_NAME, backupBeforeSave, copyMissingFiles, dailyBackupName, dailyBackupsToRemove, damagedName, isAppUrl, localDay, setAsideDamaged,
} = require('../electron/vaultFiles.cjs');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('backup names', () => {
  it('use the local date, not the UTC one', () => {
    // 11:30pm local time on 3 March is already 4 March in UTC for anyone west of Greenwich.
    const late = new Date(2026, 2, 3, 23, 30, 0);
    expect(localDay(late)).toBe('2026-03-03');
    expect(dailyBackupName(late)).toBe('planner-2026-03-03.json');
    expect(damagedName(late)).toBe('planner.json.damaged-2026-03-03-233000');
    expect(BACKUP_NAME.test(dailyBackupName(late))).toBe(true);
  });

  it('prune only daily backups beyond the newest ones', () => {
    const files = ['planner-2026-01-01.json', 'planner-2026-01-03.json', 'planner-2026-01-02.json', 'planner-2026-01-01-before-restore-101010.json', 'notes.txt'];
    expect(dailyBackupsToRemove(files, 2)).toEqual(['planner-2026-01-01.json']);
    expect(dailyBackupsToRemove(files, 30)).toEqual([]);
  });
});

describe('daily backup before saving', () => {
  const day = new Date(2026, 9, 13, 9, 0, 0);
  it('keeps planner.json as it was before the first save of the day', () => {
    const data = path.join(dir, 'planner.json');
    const backups = path.join(dir, 'backups');
    fs.writeFileSync(data, '{"v":"yesterday"}');
    expect(backupBeforeSave(data, backups, 30, day)).toBe('planner-2026-10-13.json');
    fs.writeFileSync(data, '{"v":"today 1"}');
    expect(backupBeforeSave(data, backups, 30, day)).toBeNull(); // already have today's
    expect(fs.readFileSync(path.join(backups, 'planner-2026-10-13.json'), 'utf8')).toBe('{"v":"yesterday"}');
  });

  it('does nothing for a new planner or a damaged file, and prunes old copies', () => {
    const data = path.join(dir, 'planner.json');
    const backups = path.join(dir, 'backups');
    expect(backupBeforeSave(data, backups, 30, day)).toBeNull();
    fs.writeFileSync(data, '{"half');
    expect(backupBeforeSave(data, backups, 30, day)).toBeNull();
    fs.mkdirSync(backups);
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-12']) fs.writeFileSync(path.join(backups, `planner-${d}.json`), '{}');
    fs.writeFileSync(data, '{}');
    backupBeforeSave(data, backups, 2, day);
    expect(fs.readdirSync(backups).sort()).toEqual(['planner-2026-10-12.json', 'planner-2026-10-13.json']);
  });
});

describe('a planner.json that couldn’t be read', () => {
  it('is renamed, never deleted', () => {
    const data = path.join(dir, 'planner.json');
    fs.writeFileSync(data, 'garbage');
    const name = setAsideDamaged(data, new Date(2026, 0, 2, 3, 4, 5));
    expect(name).toBe('planner.json.damaged-2026-01-02-030405');
    expect(fs.existsSync(data)).toBe(false);
    expect(fs.readFileSync(path.join(dir, name), 'utf8')).toBe('garbage');
    expect(setAsideDamaged(data)).toBeNull();
  });
});

describe('moving attachments to a new folder', () => {
  it('copies sub-folders and never replaces files already there', () => {
    const from = path.join(dir, 'old', 'attachments');
    const to = path.join(dir, 'new', 'attachments');
    fs.mkdirSync(path.join(from, 'unit 1'), { recursive: true });
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(from, 'a.pdf'), 'A');
    fs.writeFileSync(path.join(from, 'unit 1', 'b.png'), 'B');
    fs.writeFileSync(path.join(from, 'same.txt'), 'old');
    fs.writeFileSync(path.join(to, 'same.txt'), 'new');
    const res = copyMissingFiles(from, to);
    expect(res).toEqual({ copied: 2, skipped: 1, failed: [] });
    expect(fs.readFileSync(path.join(to, 'unit 1', 'b.png'), 'utf8')).toBe('B');
    expect(fs.readFileSync(path.join(to, 'same.txt'), 'utf8')).toBe('new');
  });

  it('is fine when there are no attachments', () => {
    expect(copyMissingFiles(path.join(dir, 'none'), path.join(dir, 'to'))).toEqual({ copied: 0, skipped: 0, failed: [] });
  });

  it.skipIf(process.getuid?.() === 0)('reports files it couldn’t copy', () => {
    const from = path.join(dir, 'from');
    fs.mkdirSync(from);
    fs.writeFileSync(path.join(from, 'locked.pdf'), 'x');
    fs.chmodSync(path.join(from, 'locked.pdf'), 0o000);
    const res = copyMissingFiles(from, path.join(dir, 'to'));
    expect(res.failed).toEqual(['locked.pdf']);
  });
});

describe('isAppUrl', () => {
  const index = pathToFileURL(path.resolve('/opt/Teacher Planner/resources/app/dist/index.html')).href;
  it('accepts the app page with any #route or ?query', () => {
    expect(isAppUrl(index, index)).toBe(true);
    expect(isAppUrl(`${index}#/view/abc`, index)).toBe(true);
    expect(isAppUrl(`${index}?x=1#/settings`, index)).toBe(true);
  });
  it('rejects other files and web pages', () => {
    expect(isAppUrl(pathToFileURL('/home/me/Downloads/evil.html').href, index)).toBe(false);
    expect(isAppUrl(index.replace('index.html', 'other.html'), index)).toBe(false);
    expect(isAppUrl('https://example.com/', index)).toBe(false);
    expect(isAppUrl('javascript:alert(1)', index)).toBe(false);
    expect(isAppUrl('not a url', index)).toBe(false);
  });
  it('accepts only the dev server origin while developing', () => {
    expect(isAppUrl('http://localhost:5173/#/planner', index, 'http://localhost:5173/')).toBe(true);
    expect(isAppUrl('http://localhost:5174/', index, 'http://localhost:5173/')).toBe(false);
    expect(isAppUrl(index, index, 'http://localhost:5173/')).toBe(false);
  });
});
