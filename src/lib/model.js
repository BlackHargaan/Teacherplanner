import { addDays, startOfWeek, today, shiftYear, dayOfWeek, planningAnchor } from './dates.js';
import { BUILTIN_FRAMEWORKS } from '../data/standards.js';
import {
  CLASS_COLORS, DEFAULT_SCALE, DEFAULT_STATUSES, LESSON_LAYOUTS, SECTION_COLORS,
} from '../data/presets.js';
import { buildCalendar, meetingIndexOnOrAfter } from './schedule.js';

export const uid = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------- factories

export function makeSections(names) {
  return names.slice(0, 10).map((name, i) => ({
    id: uid('sec'),
    name,
    color: SECTION_COLORS[i % SECTION_COLORS.length],
    font: 'inherit',
    size: '0.9rem',
    bold: false,
    hidden: false,
  }));
}

export function makeYear(fields = {}) {
  return {
    id: uid('year'),
    name: 'School Year',
    start: today(),
    end: addDays(today(), 280),
    scheduleType: 'weekly',
    weekdays: [1, 2, 3, 4, 5],
    cycleLength: 6,
    cycleStartDay: 1,
    nonSchoolDays: [],
    cancelledDayRotation: 'keep',
    rotationOverrides: {},
    periods: [],
    gradingPeriods: [],
    dayTypes: [],
    dayAssignments: {},
    overrides: [],
    ...fields,
  };
}

export function makeClass(fields = {}) {
  return {
    id: uid('class'),
    yearId: null,
    ownerId: null,
    name: 'New Class',
    room: '',
    color: CLASS_COLORS[0],
    font: 'inherit',
    fontSize: '0.9rem',
    order: 0,
    sections: makeSections(LESSON_LAYOUTS[0].sections),
    slots: [],
    sequence: [],
    sharing: {},
    sectionPermissions: {},
    templateIds: [],
    students: [],
    gradebook: { categories: [{ id: uid('cat'), name: 'Classwork', weight: 100 }], assignments: [], scores: {} },
    seatingCharts: [],
    standardScores: [],
    ...fields,
  };
}

export function makeBank(fields = {}) {
  return {
    id: uid('bank'),
    ownerId: null,
    name: 'New Lesson Bank',
    color: CLASS_COLORS[4],
    sections: makeSections(LESSON_LAYOUTS[0].sections),
    sequence: [],
    sharing: {},
    sectionPermissions: {},
    ...fields,
  };
}

export function makeLesson(fields = {}) {
  return {
    id: uid('lesson'),
    homeType: 'class',
    homeId: null,
    ownerId: null,
    title: '',
    content: {},
    attachments: [],
    standardIds: [],
    strategies: [],
    differentiation: [],
    accommodations: [],
    statusIds: [],
    addedTemplateIds: [],
    removedTemplateIds: [],
    privateNotes: {},
    updatedAt: Date.now(),
    ...fields,
  };
}

export function makeTemplate(fields = {}) {
  return {
    id: uid('tpl'),
    ownerId: null,
    name: 'New Template',
    position: 'append',
    content: {},
    standardIds: [],
    strategies: [],
    attachments: [],
    ...fields,
  };
}

export function makeView(fields = {}) {
  return {
    id: uid('view'),
    ownerId: null,
    name: 'Student View',
    audience: 'student',
    classIds: [],
    sectionNames: null, // null = all sections
    showAttachments: true,
    showStandards: false,
    dateMode: 'week', // day | week | range
    pastDays: 0,
    futureDays: 7,
    statusIds: [], // empty = any status
    showSubNotes: false,
    allowSubNotes: false,
    showPrivate: false,
    ...fields,
  };
}

// ---------------------------------------------------------------- lookups

export const currentYear = (state) => state.years.find((y) => y.id === state.currentYearId) || state.years[0];
export const currentUser = (state) => state.users.find((u) => u.id === state.currentUserId) || state.users[0];

export function yearClasses(state, yearId = state.currentYearId) {
  return state.classes.filter((c) => c.yearId === yearId).sort((a, b) => a.order - b.order);
}

export function findContainer(state, type, id) {
  return type === 'bank' ? state.banks.find((b) => b.id === id) : state.classes.find((c) => c.id === id);
}

export function lessonHome(state, lesson) {
  return lesson ? findContainer(state, lesson.homeType, lesson.homeId) : null;
}

/**
 * Copy the planner for an edit. Standards downloaded from the state catalog
 * are read-only, so every copy (and every undo step) shares one list of them.
 */
export function cloneState(state) {
  const { frameworks = [], ...rest } = state;
  const copy = structuredClone(rest);
  copy.frameworks = frameworks.map((f) => (f.source?.catalog ? { ...f } : structuredClone(f)));
  return copy;
}

/**
 * Frameworks shown in the app. Teachers can remove the built-in samples; a
 * removed one is only hidden (state.hiddenFrameworks), so lessons tagged with
 * its standards keep their labels and it can be brought back.
 */
export function allFrameworks(state, { includeHidden = false } = {}) {
  const hidden = new Set(includeHidden ? [] : state.hiddenFrameworks || []);
  return [...BUILTIN_FRAMEWORKS, ...(state.frameworks || [])].filter((f) => !hidden.has(f.id));
}

export const isBuiltinFramework = (id) => BUILTIN_FRAMEWORKS.some((f) => f.id === id);

/** Every standard by id, including hidden frameworks (so existing tags keep their labels). */
export function standardIndex(state) {
  const map = {};
  const hidden = new Set(state.hiddenFrameworks || []);
  for (const fw of allFrameworks(state, { includeHidden: true })) {
    for (const st of fw.standards) map[st.id] = { ...st, frameworkId: fw.id, frameworkName: fw.name, subject: fw.subject, hidden: hidden.has(fw.id) };
  }
  return map;
}

/** Options for standards pickers: no removed frameworks or retired standards, unless already chosen. */
export function standardOptions(index, selected = []) {
  const keep = new Set(selected);
  return Object.values(index)
    .filter((s) => keep.has(s.id) || (!s.hidden && !s.retired))
    .map((s) => ({ value: s.id, label: s.code, sub: `${s.retired ? 'Retired · ' : ''}${s.subject} · ${s.description}` }));
}

// ---------------------------------------------------------------- permissions

/** 'owner' | 'edit' | 'view' | null */
export function containerRole(container, userId) {
  if (!container) return null;
  if (container.ownerId === userId) return 'owner';
  return container.sharing?.[userId] || null;
}

export const canView = (container, userId) => !!containerRole(container, userId);
export const canEdit = (container, userId) => ['owner', 'edit'].includes(containerRole(container, userId));

/** Access to one lesson section: 'edit' | 'view' | 'none'. */
export function sectionAccess(container, sectionId, userId) {
  const role = containerRole(container, userId);
  if (role === 'owner') return 'edit';
  if (!role) return 'none';
  const override = container.sectionPermissions?.[sectionId]?.[userId];
  if (override) return override;
  return role === 'edit' ? 'edit' : 'view';
}

// ---------------------------------------------------------------- templates

export function effectiveTemplateIds(cls, lesson) {
  const ids = new Set(cls?.templateIds || []);
  for (const id of lesson?.addedTemplateIds || []) ids.add(id);
  for (const id of lesson?.removedTemplateIds || []) ids.delete(id);
  return [...ids];
}

const norm = (s) => (s || '').trim().toLowerCase();

/** Template text for one section (templates match sections by name). */
export function templateTextFor(templates, section) {
  const before = [];
  const after = [];
  for (const t of templates) {
    const key = Object.keys(t.content || {}).find((k) => norm(k) === norm(section.name));
    const text = key && t.content[key];
    if (!text) continue;
    (t.position === 'prepend' ? before : after).push({ templateId: t.id, name: t.name, text });
  }
  return { before, after };
}

// ---------------------------------------------------------------- planner helpers

export function sequenceFor(container) {
  return container?.sequence || [];
}

/** Lessons scheduled for a class between two dates, with meeting info. */
export function scheduledLessons(state, calendar, cls, start, end) {
  return (calendar.byClass[cls.id] || [])
    .filter((m) => m.date >= start && m.date <= end)
    .map((m) => ({ meeting: m, lesson: state.lessons[cls.sequence[m.index]] || null }));
}

// ---------------------------------------------------------------- year rollover

/**
 * Copy a year (calendar shape, classes, sections, time slots, templates and
 * lesson sequences) into a new year. Lessons are deep-copied so the new year
 * can be adapted without changing last year's record.
 */
export function rolloverYear(state, yearId, { name, start, end, copyLessons = true }) {
  const src = state.years.find((y) => y.id === yearId);
  const shift = (d) => shiftYear(d, 1);
  const classMap = {};
  const newYear = {
    ...structuredClone(src),
    id: uid('year'),
    name,
    start,
    end,
    // Cancelled days and district rotation marks belong to one year only.
    nonSchoolDays: (src.nonSchoolDays || []).filter((r) => r.kind !== 'cancelled').map((r) => ({ ...r, start: shift(r.start), end: r.end ? shift(r.end) : undefined })),
    gradingPeriods: (src.gradingPeriods || []).map((g) => ({ ...g, id: uid('term'), start: shift(g.start), end: shift(g.end) })),
    rotationOverrides: {},
    dayAssignments: {},
    overrides: [],
  };
  const newClasses = [];
  const newLessons = {};
  for (const cls of state.classes.filter((c) => c.yearId === yearId)) {
    const copy = structuredClone(cls);
    copy.id = uid('class');
    copy.yearId = newYear.id;
    copy.students = [];
    copy.gradebook = { categories: cls.gradebook.categories, assignments: [], scores: {} };
    copy.seatingCharts = (cls.seatingCharts || []).map((c) => ({ ...c, seats: {} }));
    copy.standardScores = [];
    classMap[cls.id] = copy.id;
    if (copyLessons) {
      const idMap = {};
      copy.sequence = cls.sequence.map((lid) => {
        if (!lid) return null;
        const lesson = state.lessons[lid];
        if (!lesson) return null;
        if (lesson.homeType !== 'class' || lesson.homeId !== cls.id) return lid; // keep links to shared content
        if (!idMap[lid]) {
          const nl = { ...structuredClone(lesson), id: uid('lesson'), homeId: copy.id, statusIds: [], updatedAt: Date.now() };
          idMap[lid] = nl.id;
          newLessons[nl.id] = nl;
        }
        return idMap[lid];
      });
    } else {
      copy.sequence = [];
    }
    newClasses.push(copy);
  }
  newYear.dayTypes = (newYear.dayTypes || []).map((t) => ({
    ...t,
    slots: (t.slots || []).map((s) => ({ ...s, classId: classMap[s.classId] || s.classId })),
  }));
  return { year: newYear, classes: newClasses, lessons: newLessons };
}

// ---------------------------------------------------------------- initial state

export function emptyState() {
  const user = { id: uid('user'), name: 'Me', email: '' };
  const year = makeYear({ name: 'My School Year' });
  return {
    version: 1,
    users: [user],
    currentUserId: user.id,
    years: [year],
    currentYearId: year.id,
    classes: [],
    banks: [],
    lessons: {},
    templates: [],
    statuses: structuredClone(DEFAULT_STATUSES),
    frameworks: [],
    library: { strategies: [], differentiation: [], accommodations: [] },
    scale: structuredClone(DEFAULT_SCALE),
    views: [],
    subNotes: {},
    subFeedback: {},
    integrations: { googleClientId: '' },
  };
}

function schoolYearBounds(ref) {
  const [y, m] = ref.split('-').map(Number);
  const startYear = m >= 7 ? y : y - 1;
  let start = `${startYear}-08-24`;
  while (dayOfWeek(start) !== 1) start = addDays(start, 1);
  return { start, end: `${startYear + 1}-06-11`, label: `${startYear}–${String(startYear + 1).slice(2)}` };
}

export function demoState() {
  const state = emptyState();
  const me = state.users[0];
  me.name = 'Ms. Rivera';
  me.email = 'rivera@school.example';
  const colleague = { id: uid('user'), name: 'Mr. Lee', email: 'lee@school.example' };
  state.users.push(colleague);

  const { start, end, label } = schoolYearBounds(today());
  const year = state.years[0];
  Object.assign(year, {
    name: `School Year ${label}`,
    start,
    end,
    nonSchoolDays: [
      { start: addDays(start, 14), label: 'Labor Day' },
      { start: addDays(start, 87), end: addDays(start, 89), label: 'Thanksgiving Break' },
      { start: addDays(start, 119), end: addDays(start, 133), label: 'Winter Break' },
    ],
  });

  const slot = (dayKeys, s, e) => dayKeys.map((d) => ({ dayKey: d, start: s, end: e }));
  const all = ['W1', 'W2', 'W3', 'W4', 'W5'];
  const math = makeClass({
    yearId: year.id, ownerId: me.id, name: 'Math 7', room: '204', color: CLASS_COLORS[0], order: 0,
    slots: slot(all, '08:00', '08:50'),
  });
  const sci = makeClass({
    yearId: year.id, ownerId: me.id, name: 'Science 7', room: 'Lab 2', color: CLASS_COLORS[1], order: 1,
    sections: makeSections(LESSON_LAYOUTS[1].sections),
    slots: slot(all, '09:00', '09:50'),
  });
  const ela = makeClass({
    yearId: year.id, ownerId: me.id, name: 'ELA 7', room: '204', color: CLASS_COLORS[2], order: 2,
    sections: makeSections(LESSON_LAYOUTS[4].sections),
    slots: [...slot(['W1', 'W3', 'W5'], '10:00', '10:50'), ...slot(['W2', 'W4'], '10:00', '11:30')],
  });
  state.classes.push(math, sci, ela);

  year.dayTypes = [
    {
      id: uid('day'), name: 'Half Day', countsInRotation: true,
      slots: [
        { classId: math.id, start: '08:00', end: '08:30' },
        { classId: sci.id, start: '08:35', end: '09:05' },
        { classId: ela.id, start: '09:10', end: '09:40' },
      ],
    },
    { id: uid('day'), name: 'Teacher Planning Day', countsInRotation: true, slots: [] },
  ];

  const names = ['Ava Brooks', 'Liam Chen', 'Mia Davis', 'Noah Evans', 'Zoe Garcia', 'Eli Hughes', 'Ivy Johnson', 'Leo Kim', 'Ruby Lopez', 'Owen Martin', 'Nora Patel', 'Max Quinn'];
  for (const c of [math, sci, ela]) {
    c.students = names.map((n) => {
      const [first, last] = n.split(' ');
      return { id: uid('stu'), first, last, notes: '' };
    });
  }

  const tpl = makeTemplate({
    ownerId: me.id,
    name: 'Daily Math Routine',
    position: 'prepend',
    content: { 'Warm-Up': 'Number Talk (5 min) — mental math strategy share.', Assessment: 'Exit ticket: 2 questions on today’s target.' },
    strategies: ['Number Talks', 'Exit Ticket'],
  });
  state.templates.push(tpl);
  math.templateIds = [tpl.id];

  const cal = buildCalendar(year, state.classes);
  const weekStart = startOfWeek(planningAnchor());
  const put = (cls, offset, fields) => {
    const lesson = makeLesson({ homeType: 'class', homeId: cls.id, ownerId: me.id, ...fields });
    const content = {};
    for (const [secName, text] of Object.entries(fields.content || {})) {
      const sec = cls.sections.find((x) => x.name === secName);
      if (sec) content[sec.id] = text;
    }
    lesson.content = content;
    state.lessons[lesson.id] = lesson;
    const idx = meetingIndexOnOrAfter(cal, cls.id, weekStart) + offset;
    while (cls.sequence.length < idx) cls.sequence.push(null);
    cls.sequence[idx] = lesson.id;
  };

  const mathLessons = [
    ['Proportional relationships', ['7.RP.A.2'], 'Students identify proportional relationships in tables.'],
    ['Constant of proportionality', ['7.RP.A.2'], 'Find k from tables, graphs and equations.'],
    ['Graphing proportions', ['7.RP.A.2'], 'Graph proportional relationships; interpret (1, r).'],
    ['Adding integers', ['7.NS.A.1'], 'Model integer addition on number lines.'],
    ['Quiz: proportional reasoning', ['7.RP.A.2'], 'Unit check-in quiz.'],
  ];
  mathLessons.forEach(([title, standardIds, obj], i) =>
    put(math, i, {
      title, standardIds,
      statusIds: [i < 2 ? 'st-ready' : 'st-draft'],
      strategies: ['Think-Pair-Share'],
      content: { Objectives: obj, Instruction: 'Model two examples, then partner practice.', Homework: `Workbook p. ${40 + i * 2}` },
    }),
  );
  const sciLessons = [
    ['Cells: the building blocks', ['MS-LS1-1'], 'Microscope observation of onion cells.'],
    ['Cell parts and functions', ['MS-LS1-2'], 'Build a cell analogy model.'],
    ['Plant vs. animal cells', ['MS-LS1-2'], 'Venn diagram comparison.'],
  ];
  sciLessons.forEach(([title, standardIds, explore], i) =>
    put(sci, i, {
      title, standardIds, statusIds: ['st-ready'],
      content: { Engage: 'Phenomenon video + noticing/wondering.', Explore: explore, Evaluate: 'Exit ticket.' },
      attachments: [{ id: uid('att'), type: 'video', name: 'Intro to cells', url: 'https://www.youtube.com/results?search_query=cells+for+kids' }],
    }),
  );
  ['Theme in short stories', 'Citing textual evidence', 'Writing workshop: claims'].forEach((title, i) =>
    put(ela, i, {
      title, standardIds: [i === 2 ? 'W.8.1' : i === 1 ? 'RL.7.1' : 'RL.7.2'], statusIds: ['st-approved'],
      content: { 'Mini-Lesson': `${title} — anchor chart and model.`, 'Work Time': 'Independent reading with sticky-note annotations.', Share: 'Partner share.' },
    }),
  );

  // A colleague's shared team bank
  const bank = makeBank({
    ownerId: colleague.id, name: '7th Grade Science Team Bank', color: CLASS_COLORS[5],
    sections: makeSections(LESSON_LAYOUTS[1].sections),
    sharing: { [me.id]: 'view' },
  });
  ['Ecosystems intro', 'Food webs', 'Population data lab', 'Human impact project'].forEach((title, i) => {
    const l = makeLesson({ homeType: 'bank', homeId: bank.id, ownerId: colleague.id, title, standardIds: [i === 2 ? 'MS-LS2-1' : 'MS-ESS3-3'], statusIds: ['st-approved'] });
    l.content[bank.sections[0].id] = `Team-designed hook for “${title}”.`;
    l.content[bank.sections[1].id] = 'Lab stations (see attachment).';
    state.lessons[l.id] = l;
    bank.sequence.push(l.id);
  });
  state.banks.push(bank);

  math.seatingCharts = [{
    id: uid('seat'), name: 'Pairs', rows: 3, cols: 6, disabled: ['0-2', '1-2', '2-2'],
    seats: Object.fromEntries(math.students.map((st, i) => [`${Math.floor(i / 5)}-${[0, 1, 3, 4, 5][i % 5]}`, st.id])),
  }];
  math.students[3].notes = 'IEP: extended time, preferential seating';

  // Gradebook sample
  const quiz = { id: uid('asg'), name: 'Ratios Quiz', categoryId: math.gradebook.categories[0].id, date: addDays(weekStart, -3), points: 20, standardIds: ['7.RP.A.2'] };
  math.gradebook.assignments.push(quiz);
  math.gradebook.scores[quiz.id] = Object.fromEntries(math.students.map((s, i) => [s.id, 12 + ((i * 7) % 9)]));
  math.standardScores = math.students.map((s, i) => ({
    id: uid('ss'), studentId: s.id, standardId: '7.RP.A.2', date: addDays(weekStart, -3), score: 1 + ((i * 3) % 4),
  }));

  state.views.push(
    makeView({ ownerId: me.id, name: 'Students — this week', audience: 'student', classIds: [math.id, sci.id, ela.id], statusIds: ['st-ready', 'st-approved'] }),
    makeView({ ownerId: me.id, name: 'Substitute plans', audience: 'substitute', classIds: [math.id, sci.id, ela.id], dateMode: 'day', showSubNotes: true, allowSubNotes: true, showStandards: true }),
  );
  return state;
}
