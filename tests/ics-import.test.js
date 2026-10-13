import { describe, it, expect } from 'vitest';
import { applyImport, classify, cleanLabel, importRows, occurrences, parseICS, schoolYearsIn, termsFromEnds } from '../src/lib/icsImport.js';
import { schoolDays } from '../src/lib/schedule.js';

// Shaped like a real district Google Calendar export.
const vevent = (summary, start, end, extra = '') => `BEGIN:VEVENT
DTSTART;VALUE=DATE:${start}
DTEND;VALUE=DATE:${end}
UID:${summary.replace(/\W/g, '')}-${start}@example
SUMMARY:${summary}
${extra}END:VEVENT`;
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:District
${[
    vevent('First Day of School', '20260824', '20260825'),
    vevent('Holiday - No School', '20260907', '20260908'),
    vevent('Early Out (PD: ELA Standards)', '20260925', '20260926'),
    vevent('1st Quarter Ends', '20261015', '20261016'),
    vevent('Teacher Workday', '20261016', '20261017'),
    vevent('Thanksgiving Break', '20261125', '20261126'),
    vevent('Thanksgiving Break', '20261126', '20261127'),
    vevent('Thanksgiving Break', '20261127', '20261128'),
    vevent('Holiday Store', '20261215', '20261218'),
    vevent('2nd Quarter Ends', '20261218', '20261219'),
    vevent('Christmas Break!!!', '20261222', '20270102'),
    vevent('Staff Member\\, Birthday', '20200910', '20200911', 'RRULE:FREQ=YEARLY\n'),
    vevent('Snow Day', '20270125', '20270126'),
    vevent('Early Out / End Of Quarter', '20270312', '20270313'),
    vevent('Spring Break', '20270405', '20270410'),
    vevent('Old event', '20270420', '20270421', 'STATUS:CANCELLED\n'),
    vevent('End Of Quarter / Last Day Of School', '20270604', '20270605'),
    vevent('Last year: First Day of School', '20250825', '20250826'),
  ].join('\n')}
BEGIN:VEVENT
DTSTART:20260929T193000Z
DTEND:20260929T220000Z
UID:conf@example
SUMMARY:Fall Parent/Teacher Conferences
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260902
DTEND;VALUE=DATE:20260903
RRULE:FREQ=WEEKLY;UNTIL=20261231;BYDAY=WE
EXDATE;VALUE=DATE:20260916
UID:er-wed@example
SUMMARY:Early Release Wednesday
END:VEVENT
END:VCALENDAR`;

describe('parseICS', () => {
  const events = parseICS(ICS);
  it('reads all-day events with inclusive end dates', () => {
    const xmas = events.find((e) => e.summary === 'Christmas Break!!!');
    expect(xmas).toMatchObject({ start: '2026-12-22', end: '2027-01-01', allDay: true });
    expect(events.find((e) => e.summary.startsWith('Staff Member'))).toMatchObject({ summary: 'Staff Member, Birthday', rrule: 'FREQ=YEARLY' });
    expect(events.find((e) => e.summary === 'Fall Parent/Teacher Conferences')).toMatchObject({ allDay: false, start: '2026-09-29' });
    expect(events.find((e) => e.summary === 'Old event').cancelled).toBe(true);
  });
  it('unfolds long lines', () => {
    expect(parseICS('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260101\r\nSUMMARY:New Year\r\n  Holiday\r\nEND:VEVENT')[0].summary).toBe('New Year Holiday');
  });
});

describe('occurrences', () => {
  const events = parseICS(ICS);
  it('expands weekly rules with exceptions', () => {
    const wed = events.find((e) => e.summary === 'Early Release Wednesday');
    const dates = occurrences(wed, '2026-09-01', '2026-09-30').map((o) => o.start);
    expect(dates).toEqual(['2026-09-02', '2026-09-09', '2026-09-23', '2026-09-30']);
  });
  it('expands yearly rules into the window', () => {
    const bday = events.find((e) => e.rrule === 'FREQ=YEARLY');
    expect(occurrences(bday, '2026-07-01', '2027-06-30').map((o) => o.start)).toEqual(['2026-09-10']);
  });
});

describe('classify', () => {
  const use = (s, allDay) => classify(s, allDay).use;
  it('recognizes the days that change class plans', () => {
    expect(use('First Day of School')).toBe('firstDay');
    expect(use('End Of Quarter / Last Day Of School')).toBe('lastDay');
    expect(use('Holiday - No School')).toBe('holiday');
    expect(use('Christmas Break!!!')).toBe('holiday');
    expect(use('Optional Workday')).toBe('workday');
    expect(use('Early Out (PD: ELA Standards)')).toBe('early');
    expect(use('Snow Day')).toBe('cancelled');
    expect(use('1st Quarter Ends')).toBe('termEnd');
    expect(use('B Day')).toBe('rotation');
  });
  it('ignores the rest', () => {
    for (const s of ['Holiday Store', 'Winter Break Party', 'Picture Day', 'Field Day', '2nd Quarter Grades Stored', 'Dibels Training During Planning', 'Report Cards (Send Home)']) {
      expect(use(s)).toBe('ignore');
    }
    expect(use('Holiday', false)).toBe('ignore'); // a timed "Holiday" event isn't a day off
    expect(use('Early Release', false)).toBe('early');
  });
  it('spots grading period ends alongside other uses', () => {
    expect(classify('Early Out / End Of Quarter')).toEqual({ use: 'early', termEnd: true });
    expect(classify('End Of Quarter / Last Day Of School')).toEqual({ use: 'lastDay', termEnd: true });
  });
  it('cleans labels', () => {
    expect(cleanLabel('Christmas Break!!!')).toBe('Christmas Break');
  });
});

describe('importing a school year', () => {
  const events = parseICS(ICS);
  it('finds school years with useful events, newest first', () => {
    expect(schoolYearsIn(events).map((y) => y.label)).toEqual(['2026–27', '2025–26']);
  });

  it('suggests the right rows and hides the noise', () => {
    const rows = importRows(events, '2026-07-01', '2027-06-30');
    const suggested = rows.filter((r) => r.suggested).map((r) => r.summary);
    expect(suggested).toContain('Thanksgiving Break');
    expect(suggested).toContain('Early Release Wednesday');
    expect(suggested).not.toContain('Holiday Store');
    expect(suggested).not.toContain('Old event');
    expect(rows.find((r) => r.summary === 'Fall Parent/Teacher Conferences').suggested).toBe(false);
    expect(rows.find((r) => r.summary.startsWith('Staff Member'))).toMatchObject({ suggested: false, recurring: true });
  });

  it('applies breaks, early release, bounds and grading periods', () => {
    const year = { start: '2026-08-01', end: '2027-06-30', weekdays: [1, 2, 3, 4, 5], scheduleType: 'weekly', nonSchoolDays: [], dayAssignments: {} };
    const rows = importRows(events, '2026-07-01', '2027-06-30').filter((r) => r.suggested);
    const counts = applyImport(year, rows, { setBounds: true, makeTerms: true, earlyTypeId: 'early', makeId: () => 'id' });
    expect([year.start, year.end]).toEqual(['2026-08-24', '2027-06-04']);
    expect(year.nonSchoolDays.map((r) => [r.start, r.end, r.label, r.kind])).toEqual([
      ['2026-09-07', undefined, 'Holiday - No School', undefined],
      ['2026-10-16', undefined, 'Teacher Workday', 'workday'],
      ['2026-11-25', '2026-11-27', 'Thanksgiving Break', undefined],
      ['2026-12-22', '2027-01-01', 'Christmas Break', undefined],
      ['2027-01-25', undefined, 'Snow Day', 'cancelled'],
      ['2027-04-05', '2027-04-09', 'Spring Break', undefined],
    ]);
    expect(year.dayAssignments['2026-09-25']).toBe('early');
    expect(year.dayAssignments['2026-09-09']).toBe('early'); // weekly Early Release Wednesday
    expect(year.dayAssignments['2026-09-16']).toBeUndefined(); // excluded date
    expect(year.gradingPeriods.map((t) => [t.name, t.start, t.end])).toEqual([
      ['Quarter 1', '2026-08-24', '2026-10-15'],
      ['Quarter 2', '2026-10-16', '2026-12-18'],
      ['Quarter 3', '2026-12-19', '2027-03-12'],
      ['Quarter 4', '2027-03-13', '2027-06-04'],
    ]);
    expect(counts).toMatchObject({ start: '2026-08-24', end: '2027-06-04', terms: 4 });
    expect(schoolDays(year).some((d) => d.date === '2026-11-26')).toBe(false);
  });

  it('can replace days off from an earlier import, keeping cancelled days', () => {
    const year = {
      start: '2026-08-24', end: '2027-06-04', weekdays: [1, 2, 3, 4, 5], scheduleType: 'weekly', dayAssignments: {},
      nonSchoolDays: [{ start: '2026-11-18', end: '2026-11-20', label: 'Thanksgiving Break' }, { start: '2026-10-05', label: 'Snow', kind: 'cancelled' }],
    };
    applyImport(year, [{ use: 'holiday', summary: 'Thanksgiving Break', start: '2026-11-25', end: '2026-11-27' }], { replaceDaysOff: true });
    expect(year.nonSchoolDays.map((r) => r.start)).toEqual(['2026-10-05', '2026-11-25']);
  });

  it('marks rotation days only on rotating schedules', () => {
    const rows = [{ use: 'rotation', summary: 'B Day', start: '2026-09-09', end: '2026-09-09' }];
    const weekly = { start: '2026-09-01', end: '2026-09-30', scheduleType: 'weekly', nonSchoolDays: [] };
    const cycle = { ...weekly, scheduleType: 'cycle', cycleLength: 2 };
    applyImport(weekly, rows);
    applyImport(cycle, rows);
    expect(weekly.rotationOverrides).toBeUndefined();
    expect(cycle.rotationOverrides).toEqual({ '2026-09-09': 'C2' });
  });
});

describe('termsFromEnds', () => {
  const end = (summary, d) => ({ summary, end: d });
  it('does not invent periods for a calendar that is still being filled in', () => {
    const terms = termsFromEnds([end('1st Quarter Ends', '2026-10-15'), end('2nd Quarter Ends', '2026-12-18')], '2026-08-24', '2027-06-04');
    expect(terms.map((t) => t.name)).toEqual(['Quarter 1', 'Quarter 2']);
  });
  it('adds the final period when only that one is missing', () => {
    const terms = termsFromEnds([end('1st Semester Ends', '2027-01-15')], '2026-08-24', '2027-06-04');
    expect(terms.map((t) => [t.name, t.start, t.end])).toEqual([['Semester 1', '2026-08-24', '2027-01-15'], ['Semester 2', '2027-01-16', '2027-06-04']]);
  });
});

describe('calendar links', () => {
  it('normalizes the links teachers paste', async () => {
    const { normalizeCalendarUrl } = await import('../src/lib/icsImport.js');
    expect(normalizeCalendarUrl('webcal://example.org/cal.ics')).toBe('https://example.org/cal.ics');
    expect(normalizeCalendarUrl('https://calendar.google.com/calendar/embed?src=abc%40group.calendar.google.com&ctz=America%2FNew_York'))
      .toBe('https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics');
    expect(normalizeCalendarUrl(`https://calendar.google.com/calendar/u/0?cid=${btoa('abc@group.calendar.google.com')}`))
      .toBe('https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics');
    expect(normalizeCalendarUrl('https://calendar.google.com/calendar/ical/x/public/basic.ics')).toBe('https://calendar.google.com/calendar/ical/x/public/basic.ics');
    expect(normalizeCalendarUrl('not a link')).toBeNull();
    expect(normalizeCalendarUrl('file:///etc/passwd')).toBeNull();
  });

  it('downloads through the desktop app and checks it is a calendar', async () => {
    const { downloadCalendar } = await import('../src/lib/icsImport.js');
    const host = { fetchCalendar: async (url) => (url.includes('good') ? 'BEGIN:VCALENDAR\nEND:VCALENDAR' : '<html>') };
    await expect(downloadCalendar('https://x.org/good.ics', host)).resolves.toMatchObject({ url: 'https://x.org/good.ics' });
    await expect(downloadCalendar('https://x.org/page', host)).rejects.toThrow(/didn’t return a calendar/);
    await expect(downloadCalendar('nope', host)).rejects.toThrow(/doesn’t look like/);
    const failing = (message) => ({ fetchCalendar: async () => { throw new Error(message); } });
    await expect(downloadCalendar('https://x.org/a.ics', failing("Error invoking remote method 'calendar:fetch': Error: The calendar couldn’t be downloaded (error 404). Check that it’s shared publicly.")))
      .rejects.toThrow(/^The calendar couldn’t be downloaded \(error 404\)/);
    await expect(downloadCalendar('https://x.org/a.ics', failing("Error invoking remote method 'calendar:fetch': TypeError: net::ERR_NAME_NOT_RESOLVED")))
      .rejects.toThrow(/Check your internet connection/);
  });
});

describe('review fixes', () => {
  const weekly = (extra = '') => `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261202
DTEND;VALUE=DATE:20261203
RRULE:FREQ=WEEKLY;UNTIL=20261231;BYDAY=WE
UID:er@example
SUMMARY:Early Release
END:VEVENT
${extra}END:VCALENDAR`;
  const override = (recurrence, start, status = '') => `BEGIN:VEVENT
UID:er@example
RECURRENCE-ID;VALUE=DATE:${recurrence}
DTSTART;VALUE=DATE:${start}
DTEND;VALUE=DATE:${start.slice(0, 6)}${String(Number(start.slice(6)) + 1).padStart(2, '0')}
SUMMARY:Early Release
${status}END:VEVENT
`;
  const dates = (ics) => importRows(parseICS(ics), '2026-12-01', '2026-12-31').map((r) => r.start);

  it('a cancelled single occurrence of a repeating event is not imported', () => {
    expect(dates(weekly(override('20261216', '20261216', 'STATUS:CANCELLED\n')))).toEqual(['2026-12-02', '2026-12-09', '2026-12-23', '2026-12-30']);
  });

  it('a moved single occurrence replaces the original date', () => {
    expect(dates(weekly(override('20261216', '20261217')))).toEqual(['2026-12-02', '2026-12-09', '2026-12-17', '2026-12-23', '2026-12-30']);
  });

  it('early release never erases a day off already in the year', () => {
    const year = {
      start: '2026-08-24', end: '2027-06-04', weekdays: [1, 2, 3, 4, 5], scheduleType: 'weekly', dayAssignments: {},
      nonSchoolDays: [{ start: '2026-12-16', label: 'Snow', kind: 'cancelled' }, { start: '2026-12-23', end: '2026-12-31', label: 'Winter Break' }],
    };
    applyImport(year, importRows(parseICS(weekly()), '2026-12-01', '2026-12-31'), { earlyTypeId: 'early' });
    expect(year.nonSchoolDays.map((r) => r.label)).toEqual(['Snow', 'Winter Break']);
    expect(Object.keys(year.dayAssignments).sort()).toEqual(['2026-12-02', '2026-12-09']);
  });
});
