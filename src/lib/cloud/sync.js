// Sync between the local planner and online team lesson banks.
//
import { releaseBankLessons } from '../actions.js';

// Pure functions only (no network): the CloudProvider calls these with what
// it fetched. Model:
//   * A shared bank lives in the planner like any other bank, plus a
//     `cloud` field (role, members, invites…), so linking its lessons into
//     classes works exactly as before.
//   * state.cloud.shadow remembers a fingerprint of each bank and lesson as
//     last seen online. Something whose local fingerprint differs from the
//     shadow has unsent local edits ("dirty"): it is pushed, and a pull never
//     overwrites it.
//   * Private notes and files that only exist on this computer are never
//     uploaded.

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Short FNV-1a fingerprint of a value. */
export function fingerprint(value) {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const bankKey = (bankId) => `b:${bankId}`;
export const lessonKey = (bankId, lessonId) => `l:${bankId}:${lessonId}`;

/** The parts of a bank that are shared online. */
export function toCloudBank(bank) {
  return { id: bank.id, name: bank.name, color: bank.color, sections: bank.sections || [], sequence: (bank.sequence || []).filter(Boolean) };
}

/** A lesson as shared online: no private notes, no files stored only on this computer. */
export function toCloudLesson(lesson) {
  const { privateNotes, ownerId, ...rest } = lesson;
  return {
    ...rest,
    attachments: (lesson.attachments || []).map((a) => (a.url
      ? { id: a.id, type: a.type, name: a.name, url: a.url }
      : { id: a.id, type: a.type, name: a.name, localOnly: true })),
  };
}

export const bankLessons = (state, bankId) =>
  Object.values(state.lessons).filter((l) => l.homeType === 'bank' && l.homeId === bankId);

const pushable = (bank) => bank.cloud && !bank.cloud.revoked && ['owner', 'edit'].includes(bank.cloud.role);

/**
 * What needs uploading: banks and lessons whose local fingerprint differs
 * from the last synced one, plus lessons deleted locally.
 */
export function changesToPush(state) {
  const shadow = state.cloud?.shadow || {};
  const out = { banks: [], lessons: [], deletes: [] };
  for (const bank of state.banks.filter(pushable)) {
    const row = toCloudBank(bank);
    if (shadow[bankKey(bank.id)] !== fingerprint(row)) out.banks.push(row);
    const present = new Set();
    for (const lesson of bankLessons(state, bank.id)) {
      present.add(lesson.id);
      const data = toCloudLesson(lesson);
      if (shadow[lessonKey(bank.id, lesson.id)] !== fingerprint(data)) out.lessons.push({ id: lesson.id, bank_id: bank.id, data });
    }
    const prefix = `l:${bank.id}:`;
    for (const key of Object.keys(shadow)) {
      if (key.startsWith(prefix) && !present.has(key.slice(prefix.length))) out.deletes.push({ bank_id: bank.id, id: key.slice(prefix.length) });
    }
  }
  return out;
}

/** After a successful push, record what was sent as the new synced state. */
export function markPushed(d, pushed) {
  d.cloud ||= {};
  d.cloud.shadow ||= {};
  for (const row of pushed.banks) d.cloud.shadow[bankKey(row.id)] = fingerprint(row);
  for (const row of pushed.lessons) d.cloud.shadow[lessonKey(row.bank_id, row.id)] = fingerprint(row.data);
  for (const row of pushed.deletes) delete d.cloud.shadow[lessonKey(row.bank_id, row.id)];
}

const personName = (p) => p?.display_name || p?.email || 'A teacher';

/**
 * Merge a fresh download into the planner (mutates the draft `d`).
 * snapshot: { userId, banks, lessons, members, profiles, invites }
 * localUserId: the planner profile the signed-in account belongs to.
 */
export function applySnapshot(d, snapshot, localUserId) {
  d.cloud ||= {};
  if (d.cloud.userId && d.cloud.userId !== snapshot.userId) d.cloud.shadow = {}; // different account
  d.cloud.userId = snapshot.userId;
  d.cloud.shadow ||= {};
  const shadow = d.cloud.shadow;
  const profiles = Object.fromEntries((snapshot.profiles || []).map((p) => [p.id, p]));
  const isDirty = (key, value) => shadow[key] !== undefined && shadow[key] !== fingerprint(value);
  const seen = new Set();

  for (const row of snapshot.banks) {
    seen.add(row.id);
    const role = row.owner_id === snapshot.userId
      ? 'owner'
      : (snapshot.members.find((m) => m.bank_id === row.id && m.user_id === snapshot.userId)?.role || 'view');
    let bank = d.banks.find((b) => b.id === row.id);
    if (!bank) {
      bank = { id: row.id, name: row.name, color: row.color, sections: [], sequence: [], sharing: {}, sectionPermissions: {} };
      d.banks.push(bank);
    }
    const bk = bankKey(row.id);
    if (!isDirty(bk, toCloudBank(bank)) || !bank.cloud) {
      Object.assign(bank, { name: row.name, color: row.color, sections: row.sections || [], sequence: row.sequence || [] });
      shadow[bk] = fingerprint(toCloudBank(bank));
    }
    bank.ownerId = role === 'owner' ? localUserId : `cloud:${row.owner_id}`;
    bank.sharing = role === 'owner' ? {} : { [localUserId]: role };
    bank.cloud = {
      role,
      ownerName: personName(profiles[row.owner_id]),
      members: snapshot.members.filter((m) => m.bank_id === row.id).map((m) => ({
        userId: m.user_id, role: m.role, name: personName(profiles[m.user_id]), email: profiles[m.user_id]?.email || '',
      })),
      invites: (snapshot.invites || []).filter((i) => i.bank_id === row.id).map((i) => ({ email: i.email, role: i.role })),
      updatedAt: row.updated_at,
    };

    // lessons
    const remote = snapshot.lessons.filter((l) => l.bank_id === row.id);
    const remoteIds = new Set(remote.map((l) => l.id));
    for (const r of remote) {
      const key = lessonKey(row.id, r.id);
      const local = d.lessons[r.id];
      // Lesson ids are only unique within a bank online; never let a row in one
      // bank take over a lesson that lives in another bank or a class.
      if (local && (local.homeType !== 'bank' || local.homeId !== row.id)) continue;
      if (local && isDirty(key, toCloudLesson(local))) continue; // unsent local edit wins until pushed
      d.lessons[r.id] = {
        ...r.data,
        id: r.id,
        homeType: 'bank',
        homeId: row.id,
        ownerId: bank.ownerId,
        privateNotes: local?.privateNotes || {},
        // keep files that are on this computer for the person who added them
        attachments: (r.data.attachments || []).map((a) => local?.attachments?.find((x) => x.id === a.id && !x.url && a.localOnly) || a),
      };
      shadow[key] = fingerprint(toCloudLesson(d.lessons[r.id]));
    }
    // lessons deleted online (and not edited here since)
    for (const lesson of bankLessons(d, row.id)) {
      const key = lessonKey(row.id, lesson.id);
      if (remoteIds.has(lesson.id) || shadow[key] === undefined || isDirty(key, toCloudLesson(lesson))) continue;
      delete shadow[key];
      // Linked into a class? It becomes that class's own lesson, so it isn't
      // uploaded again as if it were new.
      releaseBankLessons(d, row.id, localUserId, new Set([lesson.id]));
    }
  }

  // Banks we can no longer see online: keep the local copy, read-only. Only
  // banks that were online before count; one shared a moment ago may simply
  // not be in this snapshot yet.
  for (const bank of d.banks) {
    if (bank.cloud && !bank.cloud.revoked && !seen.has(bank.id) && shadow[bankKey(bank.id)] !== undefined) {
      bank.cloud = { ...bank.cloud, revoked: true, role: 'view' };
      if (bank.ownerId === localUserId) bank.ownerId = 'cloud:gone';
      bank.sharing = { [localUserId]: 'view' };
    }
  }
  d.cloud.lastSync = Date.now();
}

/** Stop syncing a bank: it becomes an ordinary local bank again. */
export function detachBank(d, bankId, localUserId) {
  const bank = d.banks.find((b) => b.id === bankId);
  if (!bank) return;
  delete bank.cloud;
  bank.ownerId = localUserId;
  bank.sharing = {};
  for (const key of Object.keys(d.cloud?.shadow || {})) {
    if (key === bankKey(bankId) || key.startsWith(`l:${bankId}:`)) delete d.cloud.shadow[key];
  }
}
