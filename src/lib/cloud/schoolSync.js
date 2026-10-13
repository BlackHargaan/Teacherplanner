// School profiles: the shared part of a school year (calendar, days off,
// bell periods, grading periods, early-release schedules), synced through
// the `schools` table. Each teacher's classes, lessons and grades never go
// online; only which class sits in which period is personal and is relinked
// by period name when the bell schedule arrives.
//
// Pure functions only (no network), like sync.js. A linked year carries
// year.school = { id, name, role, joinCode, ownerName, members, shadow, base,
// updatedAt, seen, revoked }, where base is what was last synced ({ name,
// data }), shadow its fingerprint and updatedAt the server's version of it.
import { fingerprint } from './sync.js';

/** Year fields that belong to the school, not the teacher. */
export const SCHOOL_FIELDS = [
  'start', 'end', 'weekdays', 'scheduleType', 'cycleLength', 'cycleStartDay', 'cycleNames',
  'cancelledDayRotation', 'nonSchoolDays', 'rotationOverrides', 'periods', 'gradingPeriods',
];

/** Is this year's school schedule managed by someone else (read-only here)? */
export const schoolReadOnly = (year) => Boolean(year?.school && !year.school.revoked && year.school.role === 'member');

/** Can this teacher change the shared schedule? */
export const canEditSchool = (year) => Boolean(year?.school && !year.school.revoked && ['owner', 'admin'].includes(year.school.role));

/** The shared part of a year, as stored online. */
export function schoolData(year) {
  const shared = (year.dayTypes || []).filter((t) => t.school);
  const ids = new Set(shared.map((t) => t.id));
  return {
    ...Object.fromEntries(SCHOOL_FIELDS.map((k) => [k, year[k] ?? null])),
    dayTypes: shared.map((t) => ({ id: t.id, name: t.name, countsInRotation: t.countsInRotation !== false, periodTimes: t.periodTimes || {} })),
    dayAssignments: Object.fromEntries(Object.entries(year.dayAssignments || {}).filter(([, id]) => ids.has(id))),
  };
}

export const schoolPayload = (year) => ({ name: year.school?.name || '', data: schoolData(year) });
const payload = schoolPayload;
export const schoolPrint = (year) => fingerprint(payload(year));

/** Local edits to the shared schedule that haven't been uploaded. */
export const schoolDirty = (year) => Boolean(year.school?.shadow) && schoolPrint(year) !== year.school.shadow;

/**
 * When a year is first shared, alternate days that use bell periods become
 * school schedules (per-class ones can't mean anything to colleagues).
 */
export function markSharedDayTypes(year) {
  for (const t of year.dayTypes || []) if (t.periodTimes) t.school = true;
}

/**
 * Put a downloaded school schedule into a year (mutates). The teacher's own
 * alternate days and their dates are kept; classes stay in their periods,
 * matched by id, then by period name, and take the new times.
 */
export function applySchoolData(year, data, classes) {
  const before = year.periods || [];
  for (const k of SCHOOL_FIELDS) {
    if (data[k] === null || data[k] === undefined) delete year[k];
    else year[k] = structuredClone(data[k]);
  }
  year.nonSchoolDays ||= [];
  year.rotationOverrides ||= {};
  year.periods ||= [];
  year.gradingPeriods ||= [];

  const personal = (year.dayTypes || []).filter((t) => !t.school);
  const personalIds = new Set(personal.map((t) => t.id));
  year.dayTypes = [...(data.dayTypes || []).map((t) => ({ ...structuredClone(t), school: true, slots: [] })), ...personal];
  year.dayAssignments = {
    ...Object.fromEntries(Object.entries(year.dayAssignments || {}).filter(([, id]) => personalIds.has(id))),
    ...(data.dayAssignments || {}),
  };

  const byId = Object.fromEntries(year.periods.map((p) => [p.id, p]));
  const byName = Object.fromEntries(year.periods.map((p) => [p.name.trim().toLowerCase(), p]));
  const oldName = Object.fromEntries(before.map((p) => [p.id, p.name.trim().toLowerCase()]));
  const match = (periodId) => byId[periodId] || byName[oldName[periodId]];
  for (const c of classes) {
    for (const s of c.slots || []) {
      if (!s.periodId) continue;
      const p = match(s.periodId);
      if (p) Object.assign(s, { periodId: p.id, start: p.start, end: p.end });
      else delete s.periodId;
    }
  }
  // The teacher's own bell-based days (e.g. their early release) follow too.
  for (const t of personal) {
    if (!t.periodTimes) continue;
    t.periodTimes = Object.fromEntries(Object.entries(t.periodTimes)
      .map(([id, times]) => [match(id)?.id, times]).filter(([id]) => id));
  }
}

const DATA_KEYS = [...SCHOOL_FIELDS, 'dayTypes', 'dayAssignments'];

/**
 * Two admins changed the schedule at once: keep each field this teacher
 * changed since the last sync, take everything else from the server.
 * Returns the merged { name, data }.
 */
export function mergeSchool(base, local, remote) {
  const changed = (a, b) => fingerprint(a ?? null) !== fingerprint(b ?? null);
  const data = {};
  for (const k of DATA_KEYS) data[k] = changed(local.data[k], base.data?.[k]) ? local.data[k] : remote.data?.[k];
  return { name: changed(local.name, base.name) ? local.name : remote.name, data };
}

const personName = (p) => p?.display_name || p?.email || 'A teacher';

/**
 * Merge downloaded schools into the planner (mutates the draft `d`).
 * snapshot: { userId, schools, schoolMembers, profiles }
 */
export function applySchools(d, snapshot) {
  const profiles = Object.fromEntries((snapshot.profiles || []).map((p) => [p.id, p]));
  for (const year of d.years || []) {
    const link = year.school;
    if (!link) continue;
    const row = (snapshot.schools || []).find((s) => s.id === link.id);
    if (!row) {
      // Only a school we've seen online before can have gone away; one just
      // created or joined may simply not be in this snapshot yet.
      if (link.seen && !link.revoked) year.school = { ...link, revoked: true, role: 'member' };
      continue;
    }
    // Visible again (e.g. signed back in to the right account): follow it again.
    const recovered = link.revoked;
    const members = (snapshot.schoolMembers || []).filter((m) => m.school_id === row.id);
    const role = row.owner_id === snapshot.userId ? 'owner' : members.find((m) => m.user_id === snapshot.userId)?.role || 'member';
    const remote = { name: row.name, data: row.data || {} };
    // An admin's unsent edit isn't lost: merged with the server's version, it
    // stays unsent (dirty) and is uploaded next.
    const dirty = !recovered && schoolDirty(year) && role !== 'member';
    const merged = dirty && link.base ? mergeSchool(link.base, payload(year), remote) : null;
    const { revoked, ...rest } = link;
    year.school = {
      ...rest,
      name: merged ? merged.name : dirty ? link.name : row.name,
      role,
      joinCode: row.join_code,
      ownerId: row.owner_id,
      ownerName: personName(profiles[row.owner_id]),
      members: members.map((m) => ({ userId: m.user_id, role: m.role, name: personName(profiles[m.user_id]), email: profiles[m.user_id]?.email || '' })),
      updatedAt: row.updated_at,
      seen: true,
    };
    const classes = (d.classes || []).filter((c) => c.yearId === year.id);
    if (!dirty) {
      applySchoolData(year, remote.data, classes);
      year.school.shadow = schoolPrint(year);
      year.school.base = structuredClone(remote);
    } else if (merged) {
      applySchoolData(year, merged.data, classes);
      year.school.shadow = fingerprint(remote);
      year.school.base = structuredClone(remote);
    }
  }
}

/**
 * Shared schedules this teacher changed and may upload:
 * [{ yearId, id, name, data, expected }], where expected is the server
 * version the change was made on (the upload is refused if it moved on).
 */
export function schoolsToPush(state) {
  return (state.years || [])
    .filter((y) => canEditSchool(y) && y.school.seen && schoolDirty(y))
    .map((y) => ({ yearId: y.id, id: y.school.id, ...payload(y), expected: y.school.updatedAt || null }));
}

/** After uploading, remember what was sent and the server's new version. */
export function markSchoolsPushed(d, pushed) {
  for (const p of pushed) {
    const year = d.years.find((y) => y.id === p.yearId);
    if (!year?.school || year.school.id !== p.id) continue;
    const sent = { name: p.name, data: p.data };
    Object.assign(year.school, { shadow: fingerprint(sent), base: structuredClone(sent), updatedAt: p.updatedAt || year.school.updatedAt });
  }
}

/** Signed in as someone else: schools followed by the previous account stop updating. */
export function forgetSchools(d) {
  for (const year of d.years || []) {
    if (year.school && !year.school.revoked) year.school = { ...year.school, revoked: true, role: 'member' };
  }
}

/** A short code colleagues can type: 8 characters, no 0/O or 1/I look-alikes. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeJoinCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...random(8)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export const formatJoinCode = (code) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : '');

/** Stop following a school: the schedule stays, now the teacher's own (mutates). */
export function unlinkSchool(year) {
  delete year.school;
  for (const t of year.dayTypes || []) delete t.school;
}
