import { describe, it, expect } from 'vitest';
import { yearProgress } from '../src/lib/yearProgress.js';

const year = { start: '2026-08-24', gradingPeriods: [{ name: 'Quarter 1', start: '2026-08-24', end: '2026-10-23' }] };
const days = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'].map((date) => ({ date }));

describe('school year progress', () => {
  it('counts school days so far and names the grading period', () => {
    expect(yearProgress(year, days, '2026-08-25')).toMatchObject({ stage: 'during', day: 2, total: 4, percent: 50, term: 'Quarter 1' });
  });
  it('a weekend or day off counts the school days before it', () => {
    expect(yearProgress(year, [days[0], days[3]], '2026-08-26')).toMatchObject({ stage: 'during', day: 1, total: 2 });
  });
  it('knows before and after the year', () => {
    expect(yearProgress(year, days, '2026-08-01')).toMatchObject({ stage: 'before', day: 0, starts: '2026-08-24' });
    expect(yearProgress(year, days, '2026-09-30')).toMatchObject({ stage: 'after', day: 4, percent: 100 });
    expect(yearProgress(year, [], '2026-09-30')).toMatchObject({ stage: 'before', total: 0 });
  });
});
