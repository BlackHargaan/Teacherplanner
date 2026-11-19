// Saving a teacher's own planner online, so it follows them to any computer
// or browser. Pure functions only: the CloudProvider does the network calls.
//
// The planner is split into items (a school year, a class, a lesson, a
// template…), one row each online. Like team lesson banks, the planner
// remembers a fingerprint of each item as last synced (the "shadow"): an
// item whose fingerprint differs has unsent edits, is uploaded, and is
// never overwritten by a download.
//
// STUDENT INFORMATION NEVER LEAVES THE COMPUTER. Before upload a class loses
// its roster, student notes, grades, standards scores and who sits where;
// notes to and from substitutes aren't uploaded at all. When a class comes
// back down, this computer's student information is put back in.
import { fingerprint } from './sync.js';

/** Array collections in the planner, and the item kind each one's rows have. */
const LISTS = [
  ['years', 'year'],
  ['classes', 'class'],
  ['banks', 'bank'],
  ['templates', 'template'],
  ['views', 'view'],
  ['frameworks', 'framework'],
  ['statuses', 'status'],
  ['users', 'user'],
];
const SETTINGS = ['library', 'scale', 'integrations'];
const KINDS = new Set([...LISTS.map(([, k]) => k), 'lesson', 'setting']);
export const itemKey = (kind, id) => `${kind}:${id}`;

// ---------------------------------------------------------------- student data

/** A class as saved online: no students, grades, scores or seat assignments. */
export function cloudClass(cls) {
  const { students, standardScores, gradebook, seatingCharts, ...rest } = cls;
  return {
    ...rest,
    gradebook: { categories: gradebook?.categories || [], assignments: gradebook?.assignments || [] },
    seatingCharts: (seatingCharts || []).map(({ seats, ...chart }) => chart),
  };
}

/** A class from online, with this computer's student information put back. */
export function withLocalStudents(remote, local) {
  const seats = new Map((local?.seatingCharts || []).map((c) => [c.id, c.seats]));
  return {
    ...remote,
    students: local?.students || [],
    standardScores: local?.standardScores || [],
    gradebook: { ...(remote.gradebook || {}), scores: local?.gradebook?.scores || {} },
    seatingCharts: (remote.seatingCharts || []).map((c) => ({ ...c, seats: seats.get(c.id) || {} })),
  };
}

/** Files stored inside the planner stay on this computer; links travel. */
const cloudAttachments = (list) => (list || []).map((a) => (a.url || a.localOnly
  ? a
  : { id: a.id, type: a.type, name: a.name, localOnly: true }));

const withLocalFiles = (remote, local) => {
  const mine = new Map((local?.attachments || []).filter((a) => !a.url && !a.localOnly).map((a) => [a.id, a]));
  return { ...remote, attachments: (remote.attachments || []).map((a) => (a.localOnly && mine.has(a.id) ? mine.get(a.id) : a)) };
};

// ---------------------------------------------------------------- items

/** Lessons and banks shared with a team are synced by the team-bank code instead. */
const teamBankIds = (state) => new Set(state.banks.filter((b) => b.cloud).map((b) => b.id));

/** What an item looks like online. */
export function toCloud(kind, item) {
  if (kind === 'class') return cloudClass(item);
  if (kind === 'lesson' || kind === 'template') return { ...item, attachments: cloudAttachments(item.attachments) };
  return item;
}

/** An item from online, merged with what only this computer has. */
export function fromCloud(kind, remote, local) {
  if (kind === 'class') return withLocalStudents(remote, local);
  if (kind === 'lesson' || kind === 'template') return withLocalFiles(remote, local);
  return remote;
}

/** Every item of the planner that is saved online: Map key -> { kind, id, item }. */
export function plannerItems(state) {
  const out = new Map();
  const team = teamBankIds(state);
  for (const [list, kind] of LISTS) {
    for (const item of state[list] || []) {
      if (kind === 'bank' && item.cloud) continue;
      out.set(itemKey(kind, item.id), { kind, id: item.id, item });
    }
  }
  for (const lesson of Object.values(state.lessons || {})) {
    if (lesson.homeType === 'bank' && team.has(lesson.homeId)) continue;
    out.set(itemKey('lesson', lesson.id), { kind: 'lesson', id: lesson.id, item: lesson });
  }
  for (const name of SETTINGS) {
    if (state[name] !== undefined) out.set(itemKey('setting', name), { kind: 'setting', id: name, item: state[name] });
  }
  return out;
}

const getItem = (d, kind, id) => {
  if (kind === 'lesson') return d.lessons[id];
  if (kind === 'setting') return d[id];
  const list = LISTS.find(([, k]) => k === kind)[0];
  return d[list].find((x) => x.id === id);
};

const putItem = (d, kind, id, value) => {
  if (kind === 'lesson') { d.lessons[id] = value; return; }
  if (kind === 'setting') { d[id] = value; return; }
  const list = d[LISTS.find(([, k]) => k === kind)[0]];
  const at = list.findIndex((x) => x.id === id);
  if (at >= 0) list[at] = value; else list.push(value);
};

const removeItem = (d, kind, id) => {
  if (kind === 'lesson') { delete d.lessons[id]; return; }
  if (kind === 'setting') return; // settings are never deleted
  const name = LISTS.find(([, k]) => k === kind)[0];
  d[name] = d[name].filter((x) => x.id !== id);
};

/** Never delete what team-bank sync looks after. */
const ownedByTeamSync = (d, kind, id) => {
  if (kind === 'bank') return Boolean(d.banks.find((b) => b.id === id)?.cloud);
  if (kind === 'lesson') { const l = d.lessons[id]; return Boolean(l && l.homeType === 'bank' && teamBankIds(d).has(l.homeId)); }
  return false;
};

// ---------------------------------------------------------------- sync state

/** This computer's record of the online planner (kept out of the upload). */
export const plannerSync = (state) => state.cloud?.planner || null;

/** Is saving online on, for this account? */
export const savingOnline = (state, userId) => {
  const p = plannerSync(state);
  return Boolean(p?.on && userId && p.userId === userId);
};

/**
 * What to upload: items whose fingerprint differs from the last synced one,
 * and tombstones for items deleted here. Rows: { kind, item_id, data, deleted }.
 */
export function plannerChanges(state) {
  const shadow = plannerSync(state)?.shadow || {};
  const out = [];
  const present = plannerItems(state);
  for (const [key, { kind, id, item }] of present) {
    const data = toCloud(kind, item);
    if (shadow[key] !== fingerprint(data)) out.push({ key, kind, item_id: id, data, deleted: false });
  }
  for (const key of Object.keys(shadow)) {
    if (present.has(key)) continue;
    const [kind, ...rest] = key.split(':');
    out.push({ key, kind, item_id: rest.join(':'), data: null, deleted: true });
  }
  return out;
}

/** After an upload, record what was sent as the synced state. */
export function markPlannerPushed(d, rows) {
  const p = d.cloud?.planner;
  if (!p) return;
  for (const row of rows) {
    if (row.deleted) delete p.shadow[row.key];
    else p.shadow[row.key] = fingerprint(row.data);
  }
}

const newer = (a, b) => (a && b ? a > b : Boolean(a));

/**
 * Merge downloaded rows into the planner (mutates the draft). Rows:
 * { kind, item_id, data, deleted, updated_at }. Returns how many items
 * changed here and how many were edited on both computers (this one's
 * version is kept and uploaded, unless the other one is clearly newer).
 */
export function applyPlannerRows(d, rows) {
  const p = d.cloud?.planner;
  let changed = 0;
  let conflicts = 0;
  if (!p) return { changed, conflicts };
  for (const row of rows) {
    if (!KINDS.has(row.kind)) continue;
    if (row.updated_at && newer(row.updated_at, p.cursor)) p.cursor = row.updated_at;
    if (ownedByTeamSync(d, row.kind, row.item_id)) continue;
    const key = itemKey(row.kind, row.item_id);
    const base = p.shadow[key];
    const remoteFp = row.deleted ? undefined : fingerprint(row.data);
    if (remoteFp === base) continue; // nothing new
    const local = getItem(d, row.kind, row.item_id);
    const localFp = local === undefined ? undefined : fingerprint(toCloud(row.kind, local));
    if (localFp === remoteFp) { // both computers made the same change
      if (row.deleted) delete p.shadow[key]; else p.shadow[key] = remoteFp;
      continue;
    }
    const localEdited = localFp !== base;
    if (localEdited && local !== undefined) {
      // Edited here and there. Lessons know when they were last edited;
      // otherwise this computer's version wins (and goes up next).
      const remoteNewer = !row.deleted && row.kind === 'lesson' && newer(row.data.updatedAt, local.updatedAt);
      conflicts += 1;
      if (!remoteNewer) {
        if (row.deleted) delete p.shadow[key]; else p.shadow[key] = remoteFp; // ours is newer than what's online
        continue;
      }
    }
    if (row.deleted) {
      if (local !== undefined) { removeItem(d, row.kind, row.item_id); changed += 1; }
      delete p.shadow[key];
    } else {
      // Deleted here but changed elsewhere: bring it back rather than lose the edit.
      putItem(d, row.kind, row.item_id, fromCloud(row.kind, structuredClone(row.data), local));
      p.shadow[key] = remoteFp;
      changed += 1;
    }
  }
  return { changed, conflicts };
}

/** Start (or restart) syncing this computer's planner with an account. */
export function startPlannerSync(d, userId) {
  d.cloud ||= {};
  const p = d.cloud.planner;
  if (p?.userId === userId) { p.on = true; return; }
  d.cloud.planner = { on: true, userId, shadow: {}, cursor: null, linked: false };
}

export function stopPlannerSync(d) {
  if (d.cloud?.planner) d.cloud.planner.on = false;
}

/**
 * First sync of this computer with an account that already has a planner
 * online: keep the online one. This computer's items that aren't online are
 * removed (team banks and student information stay), then the rows are
 * applied as if nothing had been edited here.
 */
export function adoptOnlinePlanner(d, rows) {
  const online = new Set(rows.filter((r) => !r.deleted).map((r) => itemKey(r.kind, r.item_id)));
  for (const [key, { kind, id }] of plannerItems(d)) {
    if (!online.has(key) && kind !== 'setting') removeItem(d, kind, id);
  }
  const p = d.cloud.planner;
  // Every local item counts as "not edited" so the online copy replaces it.
  p.shadow = {};
  for (const [key, { kind, item }] of plannerItems(d)) p.shadow[key] = fingerprint(toCloud(kind, item));
  applyPlannerRows(d, rows);
  // Now in sync: what's online. Anything only here (settings) goes up next.
  p.shadow = {};
  for (const r of rows) if (!r.deleted) p.shadow[itemKey(r.kind, r.item_id)] = fingerprint(r.data);
  fixCurrentIds(d);
  p.linked = true;
}

/**
 * First sync with this computer's planner winning: everything online that
 * isn't here is deleted, and everything here is uploaded.
 */
export function replaceOnlinePlanner(d, rows) {
  const p = d.cloud.planner;
  p.shadow = {};
  for (const r of rows) if (!r.deleted) p.shadow[itemKey(r.kind, r.item_id)] = 'online'; // differs from every fingerprint: re-sent or deleted
  for (const r of rows) if (r.updated_at && newer(r.updated_at, p.cursor)) p.cursor = r.updated_at;
  p.linked = true;
}

/** After adopting a planner, the open year and teacher must exist. */
function fixCurrentIds(d) {
  if (!d.years.some((y) => y.id === d.currentYearId)) d.currentYearId = d.years[0]?.id || null;
  if (!d.users.some((u) => u.id === d.currentUserId)) d.currentUserId = d.users[0]?.id || null;
}

/** Does this planner have anything worth keeping? (classes or lessons, and not untouched sample data) */
export const hasPlans = (state) => !state.sample && (state.classes.length > 0 || Object.keys(state.lessons || {}).length > 0);

/** Does the online copy (rows) have anything worth keeping? */
export const rowsHavePlans = (rows) => rows.some((r) => !r.deleted && (r.kind === 'class' || r.kind === 'lesson'));

/**
 * Bring student information back from a backup file (after switching to the
 * online planner, or on a new computer): rosters, grades, scores and seats
 * for classes that are in both, plus sub notes. Returns how many classes.
 */
export function mergeStudentData(d, backup) {
  let n = 0;
  for (const cls of d.classes) {
    const from = (backup.classes || []).find((c) => c.id === cls.id);
    if (!from) continue;
    const merged = withLocalStudents(cloudClass(cls), from);
    cls.students = merged.students;
    cls.standardScores = merged.standardScores;
    cls.gradebook = { ...cls.gradebook, scores: merged.gradebook.scores };
    const seats = new Map((from.seatingCharts || []).map((c) => [c.id, c.seats]));
    cls.seatingCharts = (cls.seatingCharts || []).map((c) => (seats.has(c.id) ? { ...c, seats: seats.get(c.id) } : c));
    n += 1;
  }
  d.subNotes = { ...(backup.subNotes || {}), ...(d.subNotes || {}) };
  d.subFeedback = { ...(backup.subFeedback || {}), ...(d.subFeedback || {}) };
  return n;
}
