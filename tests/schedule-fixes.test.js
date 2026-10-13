import { describe, it, expect } from 'vitest';
import { applyImport, importRows, parseICS, schoolYearsIn, yearBounds } from '../src/lib/icsImport.js';
import { schoolDays, setCycleLength, weekDates, weekStartDay } from '../src/lib/schedule.js';
import { paintDates } from '../src/lib/calendarPaint.js';
import { makeClass, makeLesson, makeYear, rolloverDays, rolloverYear } from '../src/lib/model.js';
import { buildICS } from '../src/lib/ics.js';
import { dateRangeError, dayOfWeek, fromISO, isFullDate } from '../src/lib/dates.js';

const allDay = (uid, start, end, summary) => ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${summary}`, 'END:VEVENT'];
const calendar = (...events) => ['BEGIN:VCALENDAR', ...events.flat(), 'END:VCALENDAR'].join('\r\n');

describe('January–December (southern hemisphere) calendars', () => {
  const events = parseICS(calendar(
    allDay(1, '20260203', '20260204', 'First day of school'),
    allDay(2, '20260413', '20260425', 'School holidays'),
    allDay(3, '20261215', '20261216', 'Last day of school'),
    allDay(4, '20270202', '20270203', 'First day of school'),
    allDay(5, '20270412', '20270424', 'School holidays'),
    allDay(6, '20271214', '20271215', 'Last day of school'),
  ));

  it('groups school years by calendar year', () => {
    expect(schoolYearsIn(events).map((y) => [y.label, y.from, y.to])).toEqual([
      ['2027', '2027-01-01', '2027-12-31'],
      ['2026', '2026-01-01', '2026-12-31'],
    ]);
  });

  it('imports a whole year instead of ending it before it starts', () => {
    const year = { start: '2027-02-02', end: '2027-12-14', weekdays: [1, 2, 3, 4, 5], nonSchoolDays: [], dayAssignments: {}, rotationOverrides: {} };
    const pick = schoolYearsIn(events)[0];
    applyImport(year, importRows(events, pick.from, pick.to), { setBounds: true });
    expect([year.start, year.end]).toEqual(['2027-02-02', '2027-12-14']);
    expect(schoolDays(year).length).toBeGreaterThan(150);
  });

  it('picks the last day after the first day and never sets an end before the start', () => {
    const rows = [
      { use: 'lastDay', start: '2026-06-10', end: '2026-06-10' },
      { use: 'firstDay', start: '2026-08-24', end: '2026-08-24' },
      { use: 'lastDay', start: '2027-06-11', end: '2027-06-11' },
    ];
    expect(yearBounds(rows).last.end).toBe('2027-06-11');
    const year = { start: '2026-08-24', end: '2027-06-11', weekdays: [1, 2, 3, 4, 5], nonSchoolDays: [], dayAssignments: {} };
    applyImport(year, [{ use: 'firstDay', start: '2027-08-23', end: '2027-08-23' }], { setBounds: true });
    expect([year.start, year.end]).toEqual(['2026-08-24', '2027-06-11']);
  });

  it('keeps July–June years for US calendars', () => {
    const us = parseICS(calendar(allDay(1, '20260824', '20260825', 'First Day of School'), allDay(2, '20270611', '20270612', 'Last Day of School')));
    expect(schoolYearsIn(us).map((y) => [y.label, y.from, y.to])).toEqual([['2026–27', '2026-07-01', '2027-06-30']]);
  });
});

describe('rollover', () => {
  it('points linked lessons in other classes at the new copies', () => {
    const y = makeYear({ start: '2026-08-24', end: '2027-06-11' });
    const p1 = makeClass({ yearId: y.id, name: 'P1' });
    const p3 = makeClass({ yearId: y.id, name: 'P3' });
    const lesson = makeLesson({ homeType: 'class', homeId: p1.id, title: 'Ratios' });
    const banked = makeLesson({ homeType: 'bank', homeId: 'bank1', title: 'Shared' });
    // P3 lists its own lesson after P1's, so P3 is processed with P1's lesson first.
    p1.sequence = [lesson.id, banked.id];
    p3.sequence = [lesson.id, banked.id];
    const out = rolloverYear({ years: [y], classes: [p3, p1], lessons: { [lesson.id]: lesson, [banked.id]: banked } }, y.id, { name: 'n', start: '2027-08-23', end: '2028-06-09' });
    const [n3, n1] = out.classes;
    expect(n1.sequence[0]).not.toBe(lesson.id);
    expect(n3.sequence[0]).toBe(n1.sequence[0]);
    expect(out.lessons[n1.sequence[0]].homeId).toBe(n1.id);
    expect(Object.keys(out.lessons)).toHaveLength(1);
    expect(n1.sequence[1]).toBe(banked.id);
    expect(n3.sequence[1]).toBe(banked.id);
  });

  it('moves holidays by whole weeks so they stay on the same weekday', () => {
    const y = makeYear({
      start: '2026-08-24',
      end: '2027-06-11',
      nonSchoolDays: [{ start: '2026-09-07', label: 'Labor Day' }, { start: '2027-02-26', label: 'Workday', kind: 'workday' }],
      gradingPeriods: [{ id: 'g', name: 'Q1', start: '2026-08-24', end: '2026-10-23' }],
    });
    const out = rolloverYear({ years: [y], classes: [], lessons: {} }, y.id, { name: 'n', start: '2027-08-23', end: '2028-06-09' });
    expect(out.year.nonSchoolDays.map((r) => [r.start, dayOfWeek(r.start)])).toEqual([['2027-09-06', 1], ['2028-02-25', 5]]);
    expect(out.year.gradingPeriods.map((g) => [g.start, g.end])).toEqual([['2027-08-23', '2027-10-22']]);
    expect(rolloverDays('2026-08-24')).toBe(364);
    expect(rolloverDays('2026-08-24', '2027-08-25')).toBe(364); // nearest whole week
    expect(rolloverDays('2026-08-24', '2027-08-30')).toBe(371);
  });
});

describe('cancelled days on a rotation (keep its day)', () => {
  const base = {
    start: '2026-09-07', end: '2026-09-18', weekdays: [1, 2, 3, 4, 5], scheduleType: 'cycle', cycleLength: 4, cycleStartDay: 1, cancelledDayRotation: 'keep',
    nonSchoolDays: [], dayTypes: [{ id: 'rally', name: 'Pep rally', countsInRotation: false, slots: [] }], dayAssignments: { '2026-09-09': 'rally' }, rotationOverrides: {},
  };
  const keys = (y) => schoolDays(y).map((d) => `${d.date.slice(8)}:${d.dayKey}`);

  it('keeps the alternate schedule and does not advance for a non-counting day', () => {
    const y = structuredClone(base);
    paintDates(y, ['2026-09-09'], { kind: 'cancelled', label: 'Snow day' });
    expect(y.dayAssignments['2026-09-09']).toBe('rally');
    expect(keys(y)).toEqual(['07:C1', '08:C2', '10:C3', '11:C4', '14:C1', '15:C2', '16:C3', '17:C4', '18:C1']);
    expect(schoolDays(y).some((d) => d.date === '2026-09-09')).toBe(false); // still cancelled
  });

  it('still advances for a counting day', () => {
    const y = { ...structuredClone(base), dayAssignments: {} };
    paintDates(y, ['2026-09-09'], { kind: 'cancelled', label: 'Snow day' });
    expect(keys(y).slice(0, 3)).toEqual(['07:C1', '08:C2', '10:C4']);
  });
});

describe('Sunday–Thursday schools', () => {
  const sunThu = { start: '2026-09-06', end: '2026-09-24', weekdays: [0, 1, 2, 3, 4], scheduleType: 'biweekly', nonSchoolDays: [], dayAssignments: {} };

  it('keeps each week (Sunday–Thursday) on one A/B letter', () => {
    const days = schoolDays(sunThu).map((d) => `${d.date.slice(8)}:${d.dayKey}`);
    expect(days.slice(0, 10)).toEqual(['06:A0', '07:A1', '08:A2', '09:A3', '10:A4', '13:B0', '14:B1', '15:B2', '16:B3', '17:B4']);
  });

  it('starts the planner week on Sunday', () => {
    expect(weekStartDay([0, 1, 2, 3, 4])).toBe(0);
    expect(weekStartDay([1, 2, 3, 4, 5])).toBe(1);
    expect(weekDates('2026-09-06', [0, 1, 2, 3, 4])[0]).toBe('2026-09-06');
    expect(weekDates('2026-09-06', [1, 2, 3, 4, 5])[0]).toBe('2026-08-31');
    expect(weekDates('2026-09-10')[0]).toBe('2026-09-07');
  });

  it('leaves Monday–Friday A/B weeks alone', () => {
    const days = schoolDays({ ...sunThu, start: '2026-09-07', weekdays: [1, 2, 3, 4, 5] }).map((d) => d.dayKey);
    expect(days.slice(0, 6)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'B1']);
  });
});

describe('re-importing with "Replace days off"', () => {
  it('drops early release days that moved', () => {
    const cal = (early, holiday) => parseICS(calendar(allDay('er', early, early, 'Early Release'), allDay('h', holiday, holiday, 'No School - Veterans Day')));
    const year = { start: '2026-08-24', end: '2027-06-11', weekdays: [1, 2, 3, 4, 5], nonSchoolDays: [], dayTypes: [{ id: 'er' }, { id: 'other' }], dayAssignments: { '2026-10-01': 'other' }, rotationOverrides: {} };
    applyImport(year, importRows(cal('20261124', '20261111'), '2026-07-01', '2027-06-30'), { earlyTypeId: 'er' });
    applyImport(year, importRows(cal('20261120', '20261112'), '2026-07-01', '2027-06-30'), { earlyTypeId: 'er', replaceDaysOff: true });
    expect(year.dayAssignments).toEqual({ '2026-10-01': 'other', '2026-11-20': 'er' });
    expect(year.nonSchoolDays.map((r) => r.start)).toEqual(['2026-11-12']);
  });
});

describe('ICS export', () => {
  const lines = (ics) => ics.split('\r\n');
  it('escapes semicolons with a backslash', () => {
    const ics = buildICS([{ uid: 'a', date: '2026-10-12', start: '08:00', end: '08:50', title: 'Fractions; decimals' }]);
    expect(ics).toContain('SUMMARY:Fractions\\; decimals');
  });
  it('folds at 75 UTF-8 octets without splitting characters', () => {
    const ics = buildICS([{ uid: 'a', date: '2026-10-12', start: '08:00', end: '08:50', title: 'T', description: `${'é'.repeat(50)} 🍎 ${'x'.repeat(80)}` }]);
    const enc = new TextEncoder();
    for (const l of lines(ics)) {
      expect(enc.encode(l).length).toBeLessThanOrEqual(75);
      expect(l).not.toMatch(/[\uD800-\uDBFF]$/);
    }
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${'é'.repeat(50)} 🍎 ${'x'.repeat(80)}`);
  });
});

describe('shrinking the cycle', () => {
  it('pulls the start day back in, drops out-of-range marks and counts hidden meetings', () => {
    const year = { cycleLength: 6, cycleStartDay: 6, rotationOverrides: { '2026-09-09': 'C5', '2026-09-10': 'C2' } };
    const classes = [{ slots: [{ dayKey: 'C1' }, { dayKey: 'C5' }, { dayKey: 'C6' }] }, { slots: [{ dayKey: 'C4' }] }];
    expect(setCycleLength(year, 4, classes)).toBe(2);
    expect(year).toEqual({ cycleLength: 4, cycleStartDay: 1, rotationOverrides: { '2026-09-10': 'C2' } });
    expect(setCycleLength(year, 6, classes)).toBe(0);
  });
});

describe('first and last day', () => {
  it('only accepts whole dates from 1900 with the end after the start', () => {
    expect(isFullDate('2026-08-24')).toBe(true);
    expect(isFullDate('0002-08-24')).toBe(false);
    expect(isFullDate('2026-02-30')).toBe(false);
    expect(isFullDate('')).toBe(false);
    expect(dateRangeError('2026-08-24', '2027-06-11')).toBe('');
    expect(dateRangeError('2027-08-24', '2027-06-11')).not.toBe('');
    expect(dateRangeError('0202-08-24', '2027-06-11')).not.toBe('');
  });
  it('reads years before 100 literally', () => {
    expect(fromISO('0002-08-24').getFullYear()).toBe(2);
  });
});
