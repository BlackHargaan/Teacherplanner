import { describe, it, expect } from 'vitest';
import { studentAverage, achievement, standardsCoverage } from '../src/lib/reports.js';

describe('studentAverage', () => {
  it('weights categories and skips blanks', () => {
    const gb = {
      categories: [{ id: 'hw', weight: 25 }, { id: 'test', weight: 75 }],
      assignments: [
        { id: 'a', categoryId: 'hw', points: 10 },
        { id: 'b', categoryId: 'test', points: 100 },
        { id: 'c', categoryId: 'test', points: 100 },
      ],
      scores: { a: { s: 10 }, b: { s: 80 }, c: { s: '' } },
    };
    expect(studentAverage(gb, 's')).toBeCloseTo(85);
    expect(studentAverage(gb, 'nobody')).toBeNull();
  });
});

describe('achievement', () => {
  it('uses the latest score per student', () => {
    const cls = { standardScores: [
      { studentId: 'a', standardId: 'x', date: '2026-01-01', score: 1 },
      { studentId: 'a', standardId: 'x', date: '2026-02-01', score: 3 },
      { studentId: 'b', standardId: 'x', date: '2026-02-01', score: 4 },
    ] };
    const r = achievement(cls, 'x', '2026-01-01', '2026-12-31');
    expect(r.latest.a.score).toBe(3);
    expect(r.avg).toBe(3.5);
  });
});

describe('standardsCoverage', () => {
  it('counts lesson and template standards in range', () => {
    const state = {
      templates: [{ id: 't', standardIds: ['T1'] }],
      lessons: { l1: { id: 'l1', standardIds: ['S1'] } },
    };
    const cls = { id: 'c', sequence: ['l1', 'l1'], templateIds: ['t'] };
    const calendar = { byClass: { c: [{ date: '2026-01-05', index: 0 }, { date: '2026-01-06', index: 1 }] } };
    const cov = standardsCoverage(state, calendar, [cls], '2026-01-06', '2026-01-31');
    expect(cov.S1.count).toBe(1);
    expect(cov.T1.count).toBe(1);
  });
});
