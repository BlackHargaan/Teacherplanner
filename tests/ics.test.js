import { describe, it, expect } from 'vitest';
import { buildICS, googleCalendarLink } from '../src/lib/ics.js';

describe('ics', () => {
  it('builds events with escaped text and folded lines', () => {
    const ics = buildICS([{ uid: 'a@x', date: '2026-10-12', start: '08:00', end: '08:50', title: 'Math; ratios, day 1', description: 'x'.repeat(100) }]);
    expect(ics).toContain('DTSTART:20261012T080000');
    expect(ics).toContain('SUMMARY:Math\\; ratios\\, day 1');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
  it('makes Google Calendar template links', () => {
    expect(googleCalendarLink({ date: '2026-10-12', start: '08:00', end: '09:00', title: 'T' })).toContain('dates=20261012T080000%2F20261012T090000');
  });
});
