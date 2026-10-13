import { describe, it, expect } from 'vitest';
import { importRows, parseICS } from '../src/lib/icsImport.js';

// UTC times (ending in Z, as Google Calendar writes them) must land on the
// local date. Each test file runs in its own process, so this only affects it.
process.env.TZ = 'Australia/Sydney';

const calendar = (...lines) => ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n');

describe('timed events in UTC', () => {
  it('uses the local date and one day for a morning event', () => {
    // 8:30am–12:30pm Thursday 4 March 2027 in Sydney (UTC+11).
    const [e] = parseICS(calendar('BEGIN:VEVENT', 'UID:a', 'SUMMARY:Early Release', 'DTSTART:20270303T213000Z', 'DTEND:20270304T013000Z', 'END:VEVENT'));
    expect([e.start, e.end, e.allDay]).toEqual(['2027-03-04', '2027-03-04', false]);
  });

  it('leaves floating times as they are and ends at-midnight events the day before', () => {
    const [e] = parseICS(calendar('BEGIN:VEVENT', 'UID:b', 'SUMMARY:Assembly', 'DTSTART:20270304T090000', 'DTEND:20270305T000000', 'END:VEVENT'));
    expect([e.start, e.end]).toEqual(['2027-03-04', '2027-03-04']);
  });

  it('applies EXDATE and RECURRENCE-ID in local dates', () => {
    const events = parseICS(calendar(
      'BEGIN:VEVENT', 'UID:r', 'SUMMARY:Early Release', 'DTSTART:20270302T213000Z', 'DTEND:20270303T013000Z',
      'RRULE:FREQ=WEEKLY;COUNT=3', 'EXDATE:20270309T213000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:r', 'SUMMARY:Early Release', 'RECURRENCE-ID:20270316T213000Z', 'DTSTART:20270317T213000Z', 'DTEND:20270318T013000Z', 'END:VEVENT',
    ));
    const rows = importRows(events, '2027-01-01', '2027-12-31');
    expect(rows.map((r) => r.start).sort()).toEqual(['2027-03-03', '2027-03-18']);
  });
});
