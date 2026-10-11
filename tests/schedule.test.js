import { describe, it, expect } from 'vitest';
import { buildCalendar, schoolDays, dayKeysFor, meetingIndexOnOrAfter } from '../src/lib/schedule.js';

const base = {
  start: '2026-09-07', // Monday
  end: '2026-09-25',
  weekdays: [1, 2, 3, 4, 5],
  nonSchoolDays: [],
  dayTypes: [],
  dayAssignments: {},
  overrides: [],
};

describe('schoolDays', () => {
  it('weekly schedule skips weekends and holidays', () => {
    const year = { ...base, scheduleType: 'weekly', nonSchoolDays: [{ start: '2026-09-07', label: 'Labor Day' }] };
    const days = schoolDays(year);
    expect(days.length).toBe(14);
    expect(days[0]).toMatchObject({ date: '2026-09-08', dayKey: 'W2' });
  });

  it('bi-weekly alternates A and B weeks', () => {
    const days = schoolDays({ ...base, scheduleType: 'biweekly' });
    expect(days[0].dayKey).toBe('A1');
    expect(days[5].dayKey).toBe('B1');
    expect(days[10].dayKey).toBe('A1');
  });

  it('cycle schedule rotates over school days only', () => {
    const year = {
      ...base,
      scheduleType: 'cycle',
      cycleLength: 4,
      cycleStartDay: 1,
      nonSchoolDays: [{ start: '2026-09-09', end: '2026-09-10', label: 'Break' }],
    };
    const keys = schoolDays(year).map((d) => d.dayKey);
    expect(keys.slice(0, 6)).toEqual(['C1', 'C2', 'C3', 'C4', 'C1', 'C2']);
  });

  it('alternate days can be excluded from the rotation', () => {
    const year = {
      ...base,
      scheduleType: 'cycle',
      cycleLength: 3,
      dayTypes: [{ id: 'pd', name: 'Planning', countsInRotation: false, slots: [] }],
      dayAssignments: { '2026-09-08': 'pd' },
    };
    const keys = schoolDays(year).map((d) => d.dayKey);
    expect(keys.slice(0, 4)).toEqual(['C1', 'C2', 'C2', 'C3']);
  });

  it('dayKeysFor lists keys per schedule type', () => {
    expect(dayKeysFor({ scheduleType: 'cycle', cycleLength: 3 })).toEqual(['C1', 'C2', 'C3']);
    expect(dayKeysFor({ scheduleType: 'biweekly', weekdays: [1, 2] })).toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});

describe('buildCalendar', () => {
  const classes = [
    { id: 'math', slots: [{ dayKey: 'W1', start: '09:00', end: '10:00' }, { dayKey: 'W3', start: '09:00', end: '10:00' }] },
    { id: 'sci', slots: [{ dayKey: 'W1', start: '08:00', end: '09:00' }] },
  ];

  it('indexes class meetings in order', () => {
    const cal = buildCalendar({ ...base, scheduleType: 'weekly' }, classes);
    expect(cal.byClass.math.map((m) => m.date).slice(0, 3)).toEqual(['2026-09-07', '2026-09-09', '2026-09-14']);
    expect(cal.byDate['2026-09-07'].meetings.map((m) => m.classId)).toEqual(['sci', 'math']);
    expect(meetingIndexOnOrAfter(cal, 'math', '2026-09-10')).toBe(2);
  });

  it('applies add/remove overrides and alternate days', () => {
    const year = {
      ...base,
      scheduleType: 'weekly',
      overrides: [
        { id: 'o1', date: '2026-09-07', classId: 'math', type: 'remove' },
        { id: 'o2', date: '2026-09-08', classId: 'math', type: 'add', start: '13:00', end: '14:00' },
      ],
      dayTypes: [{ id: 'half', name: 'Half day', slots: [{ classId: 'sci', start: '08:00', end: '08:30' }] }],
      dayAssignments: { '2026-09-09': 'half' },
    };
    const cal = buildCalendar(year, classes);
    expect(cal.byDate['2026-09-07'].meetings.map((m) => m.classId)).toEqual(['sci']);
    expect(cal.byDate['2026-09-08'].meetings[0]).toMatchObject({ classId: 'math', extra: true });
    expect(cal.byDate['2026-09-09'].meetings.map((m) => m.classId)).toEqual(['sci']);
    expect(cal.byClass.math[0].date).toBe('2026-09-08');
  });
});
