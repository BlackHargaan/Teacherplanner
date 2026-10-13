import { describe, it, expect } from 'vitest';
import {
  CODE_ALPHABET, applySchoolData, applySchools, canEditSchool, forgetSchools, formatJoinCode, makeJoinCode, markSchoolsPushed,
  markSharedDayTypes, mergeSchool, schoolData, schoolDirty, schoolPayload, schoolReadOnly, schoolsToPush,
} from '../src/lib/cloud/schoolSync.js';
import { rolloverYear } from '../src/lib/model.js';

const adminYear = () => ({
  id: 'y1', name: 'My 2026–27', start: '2026-08-24', end: '2027-06-04', weekdays: [1, 2, 3, 4, 5], scheduleType: 'weekly',
  nonSchoolDays: [{ start: '2026-11-25', end: '2026-11-27', label: 'Thanksgiving Break' }],
  periods: [{ id: 'p1', name: '1st Period', start: '08:00', end: '08:50' }, { id: 'p2', name: '2nd Period', start: '08:55', end: '09:45' }],
  gradingPeriods: [{ id: 'g1', name: 'Quarter 1', start: '2026-08-24', end: '2026-10-15' }],
  dayTypes: [
    { id: 'early', name: 'Early Release', periodTimes: { p1: { start: '08:00', end: '08:30' } }, slots: [] },
    { id: 'mine', name: 'My field trip', slots: [{ classId: 'c1', start: '09:00', end: '09:30' }] },
  ],
  dayAssignments: { '2026-09-25': 'early', '2026-10-02': 'mine' },
});

describe('school profiles — what is shared', () => {
  it('shares the calendar, bells, terms and bell-based early release, not personal schedules', () => {
    const y = adminYear();
    markSharedDayTypes(y);
    const data = schoolData(y);
    expect(data.start).toBe('2026-08-24');
    expect(data.periods).toHaveLength(2);
    expect(data.dayTypes.map((t) => t.id)).toEqual(['early']);
    expect(data.dayAssignments).toEqual({ '2026-09-25': 'early' });
    expect(data.name).toBeUndefined(); // the year's own name stays personal
    expect(JSON.stringify(data)).not.toContain('My field trip');
  });
});

describe('applying a school schedule', () => {
  const remote = () => {
    const y = adminYear();
    markSharedDayTypes(y);
    y.periods = [{ id: 'q1', name: '1st period', start: '07:45', end: '08:40' }, { id: 'q3', name: '3rd Period', start: '10:00', end: '10:50' }];
    y.nonSchoolDays = [{ start: '2026-12-21', end: '2027-01-01', label: 'Winter Break' }];
    return schoolData(y);
  };

  it('replaces the shared parts and keeps the teacher’s own', () => {
    const mine = { ...adminYear(), periods: [{ id: 'old1', name: '1st Period', start: '08:00', end: '08:50' }, { id: 'old2', name: 'Lunch', start: '11:00', end: '11:30' }] };
    mine.dayTypes = mine.dayTypes.filter((t) => t.id === 'mine');
    mine.dayAssignments = { '2026-10-02': 'mine' };
    const classes = [{ id: 'c1', yearId: 'y1', slots: [
      { dayKey: 'W1', start: '08:00', end: '08:50', periodId: 'old1' }, // matched by name → 1st period
      { dayKey: 'W2', start: '11:00', end: '11:30', periodId: 'old2' }, // no such period → unlinked, time kept
      { dayKey: 'W3', start: '13:00', end: '13:50' },
    ] }];
    applySchoolData(mine, remote(), classes);
    expect(mine.nonSchoolDays.map((r) => r.label)).toEqual(['Winter Break']);
    expect(mine.dayTypes.map((t) => [t.id, Boolean(t.school)])).toEqual([['early', true], ['mine', false]]);
    expect(mine.dayAssignments).toEqual({ '2026-10-02': 'mine', '2026-09-25': 'early' });
    expect(classes[0].slots).toEqual([
      { dayKey: 'W1', start: '07:45', end: '08:40', periodId: 'q1' },
      { dayKey: 'W2', start: '11:00', end: '11:30' },
      { dayKey: 'W3', start: '13:00', end: '13:50' },
    ]);
    expect(mine.name).toBe('My 2026–27');
  });
});

describe('syncing schools', () => {
  const row = (data, extra = {}) => ({ id: 's1', name: 'Greene Intermediate', owner_id: 'owner', join_code: 'ABCD2345', data, updated_at: 't', ...extra });
  const planner = (school) => ({ years: [{ ...adminYear(), school }], classes: [] });
  const snapshot = (userId, data, members = [{ school_id: 's1', user_id: 'ben', role: 'member' }]) => ({
    userId, schools: [row(data)], schoolMembers: members,
    profiles: [{ id: 'owner', display_name: 'Ms. Rivera' }, { id: 'ben', email: 'ben@school.org' }],
  });

  it('a member gets the schedule, the code and colleagues’ names, read-only', () => {
    const remoteYear = adminYear(); remoteYear.nonSchoolDays = [{ start: '2026-09-07', label: 'Labor Day' }];
    const d = planner({ id: 's1', role: 'member' });
    applySchools(d, snapshot('ben', schoolData(remoteYear)));
    const y = d.years[0];
    expect(y.nonSchoolDays.map((r) => r.label)).toEqual(['Labor Day']);
    expect(y.school).toMatchObject({ name: 'Greene Intermediate', role: 'member', joinCode: 'ABCD2345', ownerName: 'Ms. Rivera', seen: true });
    expect(y.school.members).toEqual([{ userId: 'ben', role: 'member', name: 'ben@school.org', email: 'ben@school.org' }]);
    expect(schoolReadOnly(y)).toBe(true);
    expect(canEditSchool(y)).toBe(false);
    expect(schoolDirty(y)).toBe(false);
    // a member's stray local edit is replaced by the school's version
    y.nonSchoolDays = [];
    applySchools(d, snapshot('ben', schoolData(remoteYear)));
    expect(y.nonSchoolDays.map((r) => r.label)).toEqual(['Labor Day']);
    expect(schoolsToPush(d)).toEqual([]);
  });

  it('an admin’s unsent edit is uploaded and not overwritten by an older copy', () => {
    const base = adminYear();
    const d = planner({ id: 's1', role: 'owner' });
    applySchools(d, snapshot('owner', schoolData(base)));
    const y = d.years[0];
    expect(canEditSchool(y)).toBe(true);
    y.nonSchoolDays.push({ start: '2027-01-25', label: 'Snow', kind: 'cancelled' });
    expect(schoolDirty(y)).toBe(true);
    applySchools(d, snapshot('owner', schoolData(base))); // stale copy
    expect(y.nonSchoolDays.at(-1).label).toBe('Snow');
    const out = schoolsToPush(d);
    expect(out).toHaveLength(1);
    expect(out[0].data.nonSchoolDays.at(-1).label).toBe('Snow');
    markSchoolsPushed(d, out);
    expect(schoolDirty(y)).toBe(false);
  });

  it('a school that disappears is marked, but only if it was seen online before', () => {
    const fresh = planner({ id: 's1', role: 'owner', shadow: 'x' });
    applySchools(fresh, { userId: 'owner', schools: [], schoolMembers: [], profiles: [] });
    expect(fresh.years[0].school.revoked).toBeUndefined();
    const seen = planner({ id: 's1', role: 'member', seen: true });
    applySchools(seen, { userId: 'ben', schools: [], schoolMembers: [], profiles: [] });
    expect(seen.years[0].school).toMatchObject({ revoked: true });
    expect(schoolReadOnly(seen.years[0])).toBe(false); // their copy is theirs to edit now
  });

  it('roles come from ownership and membership', () => {
    const d = planner({ id: 's1', role: 'member' });
    applySchools(d, snapshot('ben', schoolData(adminYear()), [{ school_id: 's1', user_id: 'ben', role: 'admin' }]));
    expect(d.years[0].school.role).toBe('admin');
    expect(canEditSchool(d.years[0])).toBe(true);
  });
});

describe('syncing schools — review fixes', () => {
  const row = (data, extra = {}) => ({ id: 's1', name: 'Greene Intermediate', owner_id: 'ana', join_code: 'ABCD2345', data, updated_at: 'v1', ...extra });
  const snap = (userId, data, extra, members = [{ school_id: 's1', user_id: 'ben', role: 'admin' }]) => ({
    userId, schools: [row(data, extra)], schoolMembers: members, profiles: [],
  });
  const linked = (userId, data) => {
    const d = { years: [{ ...adminYear(), school: { id: 's1', role: 'member' } }], classes: [] };
    applySchools(d, snap(userId, data));
    return d;
  };

  it('two admins editing at once: each keeps the fields they changed', () => {
    const start = (() => { const y = adminYear(); markSharedDayTypes(y); return schoolData(y); })();
    const ana = linked('ana', start);
    const ben = linked('ben', start);
    // Ana adds a break; Ben changes 2nd period. Ben uploads first.
    ana.years[0].nonSchoolDays.push({ start: '2026-11-25', end: '2026-11-27', label: 'Thanksgiving' });
    ben.years[0].periods[1].end = '09:55';
    const fromBen = schoolsToPush(ben);
    expect(fromBen[0].expected).toBe('v1');
    // the server only accepts an upload based on its current version
    markSchoolsPushed(ben, [{ ...fromBen[0], updatedAt: 'v2' }]);
    expect(ben.years[0].school.updatedAt).toBe('v2');
    // Ana's upload (based on v1) is refused; her next download merges
    const server = schoolPayload(ben.years[0]).data;
    applySchools(ana, snap('ana', server, { updated_at: 'v2' }));
    const y = ana.years[0];
    expect(y.periods[1].end).toBe('09:55');
    expect(y.nonSchoolDays.map((r) => r.label)).toContain('Thanksgiving');
    const again = schoolsToPush(ana);
    expect(again).toHaveLength(1);
    expect(again[0].expected).toBe('v2');
    expect(again[0].data.periods[1].end).toBe('09:55');
  });

  it('mergeSchool keeps local changes and takes the rest from the server', () => {
    const base = { name: 'A', data: { start: '1', end: '2' } };
    expect(mergeSchool(base, { name: 'A', data: { start: '9', end: '2' } }, { name: 'B', data: { start: '1', end: '7' } }))
      .toMatchObject({ name: 'B', data: { start: '9', end: '7' } });
  });

  it('a school just created is not taken for deleted by a download that started earlier', () => {
    const d = { years: [{ ...adminYear(), school: { id: 's1', role: 'owner', shadow: 'x' } }], classes: [] };
    applySchools(d, { userId: 'ana', schools: [], schoolMembers: [], profiles: [] });
    expect(d.years[0].school.revoked).toBeUndefined();
  });

  it('after switching accounts, schools stop updating, and come back for the right account', () => {
    const d = linked('ben', schoolData(adminYear()));
    forgetSchools(d);
    expect(d.years[0].school.revoked).toBe(true);
    expect(schoolsToPush(d)).toEqual([]);
    applySchools(d, snap('ben', schoolData(adminYear())));
    expect(d.years[0].school.revoked).toBeUndefined();
    expect(d.years[0].school.role).toBe('admin');
  });

  it('joining keeps the teacher’s own early release times on the school’s periods', () => {
    const mine = { ...adminYear(), periods: [{ id: 'm1', name: '1st Period', start: '08:00', end: '08:50' }] };
    mine.dayTypes = [{ id: 'own-early', name: 'My early release', periodTimes: { m1: { start: '08:00', end: '08:20' } }, slots: [] }];
    const remote = { periods: [{ id: 'p1', name: '1st period', start: '08:00', end: '08:50' }], dayTypes: [] };
    applySchoolData(mine, remote, []);
    expect(mine.dayTypes[0].periodTimes).toEqual({ p1: { start: '08:00', end: '08:20' } });
  });
});

describe('join codes', () => {
  it('are 8 characters from the unambiguous alphabet the database accepts', () => {
    for (let i = 0; i < 50; i += 1) expect(makeJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(makeJoinCode(() => [0, 1, 31, 32, 8, 9, 23, 24])).toBe('AB9AJKZ2');
    expect(formatJoinCode('ABCD2345')).toBe('ABCD-2345');
  });
});

describe('rollover', () => {
  it('next year starts unlinked, with early release schedules kept as personal ones', () => {
    const y = { ...adminYear(), school: { id: 's1', role: 'owner' } };
    markSharedDayTypes(y);
    const out = rolloverYear({ years: [y], classes: [], lessons: {} }, 'y1', { name: 'Next', start: '2027-08-23', end: '2028-06-02' });
    expect(out.year.school).toBeUndefined();
    expect(out.year.dayTypes.find((t) => t.id === 'early').school).toBeUndefined();
  });
});
