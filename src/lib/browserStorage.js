// Where the planner lives when Teacher Planner runs in a web browser.
//
// IndexedDB instead of localStorage: localStorage stops at about 5 MB (a
// year of plans with attachments can pass that) and blocks the page while
// it writes. Planners saved by older versions in localStorage are moved over
// the first time they're opened.

const DB = 'teacher-planner';
const STORE = 'planner';
const KEY = 'current';
export const LEGACY_KEY = 'teacher-planner:v1';
const CHANNEL = 'teacher-planner';

let dbPromise = null;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  }));
}

const legacy = () => { try { return localStorage.getItem(LEGACY_KEY); } catch { return null; } };

/**
 * The saved planner as JSON text, or null for a first visit. Falls back to
 * localStorage when IndexedDB isn't available (some private windows).
 */
export async function loadPlanner() {
  let text;
  try {
    text = await run('readonly', (s) => s.get(KEY));
  } catch {
    return legacy();
  }
  if (text == null) {
    text = legacy();
    if (text != null) {
      // Move it over; the old copy stays until the next save succeeds.
      try { await run('readwrite', (s) => s.put(text, KEY)); } catch { /* keep using it from localStorage */ }
    }
  }
  return text ?? null;
}

let channel;
const bus = () => {
  if (!channel && typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL);
  return channel;
};

/** Save the planner (JSON text) and tell other open tabs. */
export async function savePlanner(text) {
  try {
    await run('readwrite', (s) => s.put(text, KEY));
  } catch (err) {
    // No IndexedDB here: localStorage is all there is.
    if (!(err instanceof Error) || !/quota/i.test(err.name + err.message)) {
      localStorage.setItem(LEGACY_KEY, text); // throws when full, which the caller reports
      bus()?.postMessage('saved');
      return;
    }
    throw err;
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* fine */ }
  bus()?.postMessage('saved');
}

/** Call fn when another tab saves the planner. Returns an unsubscribe function. */
export function onOtherTabSave(fn) {
  const b = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  if (!b) return () => {};
  b.onmessage = (e) => { if (e.data === 'saved') fn(); };
  return () => b.close();
}

/**
 * Ask the browser to keep the planner even when the disk fills up or the
 * site hasn't been visited for a while (Safari otherwise clears it after
 * about a week). Resolves to true when it will be kept.
 */
export async function keepStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** { kept, usedMB } for the Settings page. */
export async function storageStatus() {
  const out = { kept: false, usedMB: null };
  try {
    out.kept = Boolean(await navigator.storage?.persisted?.());
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) out.usedMB = Math.max(0.1, Math.round(est.usage / 1e5) / 10);
  } catch { /* unknown */ }
  return out;
}

const NUDGE_KEY = 'teacher-planner:backup-nudge';

/**
 * Whether to remind a browser user to download a backup: when there has
 * never been one or the last is a month old, at most once a week, and
 * not in the first week (someone trying it out doesn't need it yet).
 */
export function backupReminderDue(lastBackup, todayISO, lastNudge) {
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  if (lastBackup && days(lastBackup, todayISO) < 30) return false;
  return Boolean(lastNudge) && days(lastNudge, todayISO) >= 7;
}

export function backupReminder(lastBackup, todayISO) {
  let last = null;
  try { last = localStorage.getItem(NUDGE_KEY); } catch { /* none */ }
  const due = backupReminderDue(lastBackup, todayISO, last);
  // The first visit starts the clock.
  if (due || !last) try { localStorage.setItem(NUDGE_KEY, todayISO); } catch { /* fine */ }
  return due;
}
