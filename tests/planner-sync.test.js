import { describe, expect, it } from 'vitest';
import { demoState, emptyState, makeClass, makeLesson } from '../src/lib/model.js';
import { fingerprint } from '../src/lib/cloud/sync.js';
import {
  adoptOnlinePlanner, applyPlannerRows, cloudClass, hasPlans, markPlannerPushed, plannerChanges, plannerItems,
  replaceOnlinePlanner, rowsHavePlans, startPlannerSync, withLocalStudents,
} from '../src/lib/cloud/plannerSync.js';

const USER = 'user-1';

/** A stand-in for the planner_items table: upserts with a server clock. */
function fakeServer() {
  const rows = new Map();
  let clock = 0;
  const stamp = () => `2026-11-19T12:00:${String(clock++).padStart(2, '0')}.000000+00:00`;
  return {
    rows,
    push(changes) {
      for (const c of changes) rows.set(c.key, { kind: c.kind, item_id: c.item_id, data: c.deleted ? null : structuredClone(c.data), deleted: c.deleted, updated_at: stamp() });
    },
    pull(cursor) { return [...rows.values()].filter((r) => !cursor || r.updated_at > cursor).map((r) => structuredClone(r)); },
  };
}

/** One sync round for a computer: pull, then push its own changes. */
function syncRound(d, server) {
  const result = applyPlannerRows(d, server.pull(d.cloud.planner.cursor));
  const ch = plannerChanges(d);
  server.push(ch);
  markPlannerPushed(d, ch);
  return { ...result, pushed: ch.length };
}

function linkedComputer(state, server) {
  startPlannerSync(state, USER);
  const rows = server.pull(null);
  if (rows.length) adoptOnlinePlanner(state, rows); else state.cloud.planner.linked = true;
  syncRound(state, server);
  return state;
}

describe('student information never leaves the computer', () => {
  it('strips rosters, notes, grades, scores and seats from classes', () => {
    const d = demoState();
    const math = d.classes[0];
    const up = cloudClass(math);
    const text = JSON.stringify(up);
    expect(up.students).toBeUndefined();
    expect(up.standardScores).toBeUndefined();
    expect(up.gradebook.scores).toBeUndefined();
    expect(up.gradebook.assignments.length).toBe(math.gradebook.assignments.length); // assignment names are plans
    expect(up.seatingCharts.every((c) => c.seats === undefined)).toBe(true);
    for (const s of math.students) expect(text).not.toContain(s.last);
    expect(text).not.toContain('IEP');
  });

  it('never uploads sub notes or sub feedback, or anything about students', () => {
    const d = demoState();
    d.subNotes = { '2026-11-19': 'Jordan Smith needs a seat by the door' };
    d.subFeedback = { x: 'Ava was great' };
    startPlannerSync(d, USER);
    const upload = JSON.stringify(plannerChanges(d));
    expect(upload).not.toContain('Jordan Smith');
    expect(upload).not.toContain('Ava was great');
    for (const c of d.classes) for (const s of c.students) {
      expect(upload).not.toContain(`"${s.first}"`);
      expect(upload).not.toContain(`"${s.last}"`);
    }
  });

  it('puts this computer’s students back when a class comes down', () => {
    const d = demoState();
    const math = d.classes[0];
    const remote = { ...cloudClass(math), name: 'Math 7 (renamed)' };
    const merged = withLocalStudents(remote, math);
    expect(merged.name).toBe('Math 7 (renamed)');
    expect(merged.students).toEqual(math.students);
    expect(merged.gradebook.scores).toEqual(math.gradebook.scores);
    expect(merged.seatingCharts[0].seats).toEqual(math.seatingCharts[0].seats);
    expect(withLocalStudents(remote, undefined).students).toEqual([]);
  });

  it('keeps editing grades from marking a class as changed', () => {
    const d = demoState();
    startPlannerSync(d, USER);
    const server = fakeServer();
    markPlannerPushed(d, (() => { const ch = plannerChanges(d); server.push(ch); return ch; })());
    const math = d.classes[0];
    math.gradebook.scores[math.gradebook.assignments[0].id][math.students[0].id] = 3;
    math.students[1].notes = 'new note';
    expect(plannerChanges(d)).toEqual([]);
  });

  it('keeps files stored in the planner on this computer, and links them back', () => {
    const d = emptyState();
    const lesson = makeLesson({ attachments: [{ id: 'a1', type: 'file', name: 'worksheet.pdf', data: 'data:application/pdf;base64,AAAA' }, { id: 'a2', type: 'link', name: 'Video', url: 'https://example.org' }] });
    d.lessons[lesson.id] = lesson;
    startPlannerSync(d, USER);
    const row = plannerChanges(d).find((r) => r.kind === 'lesson');
    expect(JSON.stringify(row.data)).not.toContain('base64');
    expect(row.data.attachments[0]).toEqual({ id: 'a1', type: 'file', name: 'worksheet.pdf', localOnly: true });
  });
});

describe('two computers', () => {
  it('uploads a first planner, and a second computer adopts it with its own students kept', () => {
    const server = fakeServer();
    const a = linkedComputer(demoState(), server);
    expect(server.rows.size).toBe(plannerItems(a).size);

    // Computer B: the same planner from a backup, plus a different note on a student.
    const b = structuredClone(a);
    delete b.cloud;
    b.classes[0].students[0].notes = 'only on B';
    b.classes.push(makeClass({ name: 'Leftover class' }));
    linkedComputer(b, server);
    expect(b.classes.map((c) => c.name)).toEqual(a.classes.map((c) => c.name)); // the online planner won
    expect(b.classes[0].students[0].notes).toBe('only on B'); // B's student info stayed
    expect(plannerChanges(b)).toEqual([]);
  });

  it('carries edits, new items and deletions both ways', () => {
    const server = fakeServer();
    const a = linkedComputer(demoState(), server);
    const b = linkedComputer(emptyState(), server); // a new computer: takes the online planner
    expect(b.classes.length).toBe(a.classes.length);
    expect(b.classes.every((c) => c.students.length === 0)).toBe(true); // no students came down

    const lessonId = Object.keys(a.lessons)[0];
    a.lessons[lessonId].title = 'Edited on A';
    a.classes.push(makeClass({ name: 'New on A' }));
    syncRound(a, server);
    const got = syncRound(b, server);
    expect(got.changed).toBe(2);
    expect(b.lessons[lessonId].title).toBe('Edited on A');
    expect(b.classes.at(-1).name).toBe('New on A');

    delete b.lessons[lessonId];
    syncRound(b, server);
    syncRound(a, server);
    expect(a.lessons[lessonId]).toBeUndefined();
    expect(plannerChanges(a)).toEqual([]);
    expect(plannerChanges(b)).toEqual([]);
  });

  it('keeps the newer lesson when both computers edited it, and this computer’s version otherwise', () => {
    const server = fakeServer();
    const a = linkedComputer(demoState(), server);
    const b = linkedComputer(emptyState(), server);
    const id = Object.keys(a.lessons)[0];
    a.lessons[id].title = 'A, earlier'; a.lessons[id].updatedAt = 1000;
    b.lessons[id].title = 'B, later'; b.lessons[id].updatedAt = 2000;
    syncRound(a, server);
    const r = syncRound(b, server); // B is newer: keeps its own and uploads it
    expect(r.conflicts).toBe(1);
    expect(b.lessons[id].title).toBe('B, later');
    syncRound(a, server);
    expect(a.lessons[id].title).toBe('B, later');

    a.years[0].name = 'Year from A';
    b.years[0].name = 'Year from B';
    syncRound(a, server);
    syncRound(b, server); // no edit time on years: B keeps its own and uploads it
    syncRound(a, server);
    expect(a.years[0].name).toBe('Year from B');
    expect(b.years[0].name).toBe('Year from B');
  });

  it('brings back an item deleted here but edited on the other computer', () => {
    const server = fakeServer();
    const a = linkedComputer(demoState(), server);
    const b = linkedComputer(emptyState(), server);
    const tpl = a.templates[0];
    if (!tpl) return;
    a.templates[0].name = 'Edited on A';
    b.templates = b.templates.filter((t) => t.id !== tpl.id);
    syncRound(a, server);
    syncRound(b, server);
    expect(b.templates.find((t) => t.id === tpl.id)?.name).toBe('Edited on A');
  });

  it('leaves lesson banks shared with a team to the team-bank sync', () => {
    const server = fakeServer();
    const d = demoState();
    const bank = d.banks[0];
    if (!bank) return;
    bank.cloud = { role: 'owner' };
    linkedComputer(d, server);
    expect([...server.rows.keys()].some((k) => k === `bank:${bank.id}`)).toBe(false);
    expect([...server.rows.values()].some((r) => r.kind === 'lesson' && r.data.homeId === bank.id)).toBe(false);
  });

  it('can replace the online planner with this computer’s', () => {
    const server = fakeServer();
    linkedComputer(demoState(), server);
    const mine = emptyState();
    mine.classes.push(makeClass({ name: 'Only mine' }));
    startPlannerSync(mine, USER);
    replaceOnlinePlanner(mine, server.pull(null));
    syncRound(mine, server);
    const live = [...server.rows.values()].filter((r) => !r.deleted);
    expect(live.filter((r) => r.kind === 'class').map((r) => r.data.name)).toEqual(['Only mine']);
    expect(live.some((r) => r.kind === 'lesson')).toBe(false);
  });
});

describe('helpers', () => {
  it('tell an empty planner from one with plans', () => {
    expect(hasPlans(emptyState())).toBe(false);
    expect(hasPlans(demoState())).toBe(false); // untouched sample data
    expect(hasPlans({ ...demoState(), sample: undefined })).toBe(true);
    expect(rowsHavePlans([{ kind: 'setting', deleted: false }])).toBe(false);
    expect(rowsHavePlans([{ kind: 'class', deleted: true }])).toBe(false);
    expect(rowsHavePlans([{ kind: 'lesson', deleted: false }])).toBe(true);
  });

  it('fingerprints don’t depend on key order', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
});
