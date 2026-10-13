import { describe, it, expect } from 'vitest';
import { buildCalendar, gradingPeriodFor, schoolDays, splitGradingPeriods } from '../src/lib/schedule.js';
import { datesBetween, offDayMap, paintDates, rangesFromMap } from '../src/lib/calendarPaint.js';
import { rolloverYear } from '../src/lib/model.js';

const base = {
  start: '2026-09-07', // Monday
  end: '2026-09-25',
  weekdays: [1, 2, 3, 4, 5],
  nonSchoolDays: [],
  dayTypes: [],
  dayAssignments: {},
  overrides: [],
};
const ab = { ...base, scheduleType: 'cycle', cycleLength: 2, cycleStartDay: 1 };
const keys = (year) => schoolDays(year).map((d) => `${d.date.slice(8)}:${d.dayKey}`);

describe('cancelled days on a rotating schedule', () => {
  const snow = [{ start: '2026-09-08', label: 'Snow day', kind: 'cancelled' }];

  it('by default every date keeps its assigned day', () => {
    expect(keys({ ...ab, nonSchoolDays: snow }).slice(0, 3)).toEqual(['07:C1', '09:C1', '10:C2']);
  });

  it('can shift the rotation instead', () => {
    expect(keys({ ...ab, nonSchoolDays: snow, cancelledDayRotation: 'shift' }).slice(0, 3)).toEqual(['07:C1', '09:C2', '10:C1']);
  });

  it('planned holidays never use up a rotation day', () => {
    expect(keys({ ...ab, nonSchoolDays: [{ start: '2026-09-08', label: 'Holiday' }] }).slice(0, 3)).toEqual(['07:C1', '09:C2', '10:C1']);
  });
});

describe('rotation overrides', () => {
  it('a date marked on the district calendar sets the rotation from then on', () => {
    expect(keys({ ...ab, rotationOverrides: { '2026-09-09': 'C1' } }).slice(0, 4)).toEqual(['07:C1', '08:C2', '09:C1', '10:C2']);
  });
});

describe('bell-based alternate days', () => {
  const periods = [{ id: 'p1', name: '1st', start: '08:00', end: '08:50' }, { id: 'p2', name: '2nd', start: '09:00', end: '09:50' }];
  const classes = [
    { id: 'math', slots: [{ dayKey: 'W1', start: '08:00', end: '08:50', periodId: 'p1' }, { dayKey: 'W3', start: '09:00', end: '09:50', periodId: 'p2' }] },
    { id: 'sci', slots: [{ dayKey: 'W1', start: '09:00', end: '09:50', periodId: 'p2' }] },
    { id: 'club', slots: [{ dayKey: 'W1', start: '15:00', end: '15:30' }] },
  ];
  it('shortens whichever periods meet that day', () => {
    const year = {
      ...base,
      scheduleType: 'weekly',
      periods,
      dayTypes: [{ id: 'early', name: 'Early release', periodTimes: { p1: { start: '08:00', end: '08:30' }, p2: null } }],
      dayAssignments: { '2026-09-07': 'early', '2026-09-09': 'early' },
    };
    const cal = buildCalendar(year, classes);
    expect(cal.byDate['2026-09-07'].meetings.map((m) => [m.classId, m.start, m.end])).toEqual([['math', '08:00', '08:30'], ['club', '15:00', '15:30']]);
    expect(cal.byDate['2026-09-09'].meetings).toEqual([]); // math meets 2nd period on Wednesdays, which is off
  });
});

describe('grading periods', () => {
  it('splits the year into equal parts by school days', () => {
    const year = { ...base, scheduleType: 'weekly' };
    const q = splitGradingPeriods(year, 3, 'Term');
    expect(q.map((p) => [p.name, p.start, p.end])).toEqual([
      ['Term 1', '2026-09-07', '2026-09-11'],
      ['Term 2', '2026-09-14', '2026-09-18'],
      ['Term 3', '2026-09-21', '2026-09-25'],
    ]);
    expect(gradingPeriodFor({ ...year, gradingPeriods: q }, '2026-09-16').name).toBe('Term 2');
    expect(gradingPeriodFor(year, '2026-09-16')).toBeNull();
  });
});

describe('painting the calendar', () => {
  it('joins days across weekends and splits ranges when a day is repainted', () => {
    const year = { ...base, scheduleType: 'weekly' };
    paintDates(year, datesBetween('2026-09-17', '2026-09-22'), { kind: 'holiday', label: 'Fall break' });
    expect(year.nonSchoolDays).toEqual([{ start: '2026-09-17', end: '2026-09-22', label: 'Fall break' }]);
    paintDates(year, ['2026-09-18'], { kind: 'school' });
    expect(year.nonSchoolDays).toEqual([
      { start: '2026-09-17', end: undefined, label: 'Fall break' },
      { start: '2026-09-21', end: '2026-09-22', label: 'Fall break' },
    ]);
  });

  it('marks cancelled days, alternate days and rotation days', () => {
    const year = { ...ab };
    paintDates(year, ['2026-09-08'], { kind: 'cancelled', label: 'Snow day' });
    paintDates(year, ['2026-09-09'], { kind: 'dayType', id: 'early' });
    paintDates(year, ['2026-09-10'], { kind: 'rotation', key: 'C1' });
    expect(year.nonSchoolDays).toEqual([{ start: '2026-09-08', end: undefined, label: 'Snow day', kind: 'cancelled' }]);
    expect(year.dayAssignments).toEqual({ '2026-09-09': 'early' });
    expect(year.rotationOverrides).toEqual({ '2026-09-10': 'C1' });
    paintDates(year, ['2026-09-08', '2026-09-09'], { kind: 'school' });
    expect(year.nonSchoolDays).toEqual([]);
    expect(year.dayAssignments).toEqual({});
    paintDates(year, ['2026-09-10'], { kind: 'clearRotation' });
    expect(year.rotationOverrides).toEqual({});
  });

  it('round-trips existing ranges', () => {
    const year = { ...base, nonSchoolDays: [{ start: '2026-09-11', end: '2026-09-15', label: 'Break' }, { start: '2026-09-16', label: 'Workday', kind: 'workday' }] };
    expect(rangesFromMap(offDayMap(year))).toEqual([
      { start: '2026-09-11', end: '2026-09-15', label: 'Break' },
      { start: '2026-09-16', end: undefined, label: 'Workday', kind: 'workday' },
    ]);
  });
});

describe('rollover', () => {
  it('carries bells and grading periods forward, but not cancelled days or rotation marks', () => {
    const year = {
      ...ab,
      id: 'y1',
      name: '2026–27',
      periods: [{ id: 'p1', name: '1st', start: '08:00', end: '08:50' }],
      gradingPeriods: [{ id: 'g1', name: 'Q1', start: '2026-09-07', end: '2026-09-25' }],
      nonSchoolDays: [{ start: '2026-09-08', label: 'Snow', kind: 'cancelled' }, { start: '2026-09-14', label: 'Holiday' }],
      rotationOverrides: { '2026-09-09': 'C2' },
    };
    const out = rolloverYear({ years: [year], classes: [], lessons: {} }, 'y1', { name: 'Next', start: '2027-09-06', end: '2027-09-24' });
    expect(out.year.periods).toEqual(year.periods);
    expect(out.year.gradingPeriods.map((g) => [g.name, g.start, g.end])).toEqual([['Q1', '2027-09-06', '2027-09-24']]); // 52 weeks on: still Mon–Fri
    expect(out.year.nonSchoolDays.map((r) => r.label)).toEqual(['Holiday']);
    expect(out.year.rotationOverrides).toEqual({});
  });
});
