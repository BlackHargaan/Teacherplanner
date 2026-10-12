import { describe, it, expect } from 'vitest';
import { assignPeriod, classInPeriod, editPeriod, nextPeriod, periodTimesFrom, removePeriod } from '../src/lib/bells.js';

const planner = () => ({
  years: [{
    id: 'y',
    periods: [{ id: 'p1', name: '1st Period', start: '08:00', end: '08:50' }, { id: 'p2', name: '2nd Period', start: '08:55', end: '09:45' }],
    dayTypes: [{ id: 'early', periodTimes: { p1: { start: '08:00', end: '08:30' }, p2: null } }],
  }],
  classes: [
    { id: 'math', yearId: 'y', slots: [] },
    { id: 'sci', yearId: 'y', slots: [{ dayKey: 'C1', start: '13:00', end: '13:50' }] },
    { id: 'old', yearId: 'other', slots: [{ dayKey: 'C1', start: '08:00', end: '08:50', periodId: 'p1' }] },
  ],
});

describe('bell schedule', () => {
  it('suggests the next period after the last', () => {
    expect(nextPeriod([])).toMatchObject({ name: '1st Period', start: '08:00', end: '08:50' });
    const p = nextPeriod(planner().years[0].periods);
    expect(p).toMatchObject({ name: '3rd Period', start: '09:50', end: '10:40' });
    expect(nextPeriod(Array.from({ length: 10 }, () => p)).name).toBe('11th Period');
  });

  it('assigns classes to periods, one meeting per class per day', () => {
    const d = planner();
    assignPeriod(d, 'y', ['C1', 'C2'], 'p1', 'math');
    expect(d.classes[0].slots).toEqual([
      { dayKey: 'C1', start: '08:00', end: '08:50', periodId: 'p1' },
      { dayKey: 'C2', start: '08:00', end: '08:50', periodId: 'p1' },
    ]);
    assignPeriod(d, 'y', ['C1'], 'p1', 'sci'); // sci takes 1st period on C1: math leaves it, sci's 1pm time is replaced
    expect(classInPeriod(d.classes, 'C1', 'p1').id).toBe('sci');
    expect(d.classes[0].slots.map((s) => s.dayKey)).toEqual(['C2']);
    expect(d.classes[1].slots).toEqual([{ dayKey: 'C1', start: '08:00', end: '08:50', periodId: 'p1' }]);
    assignPeriod(d, 'y', ['C2'], 'p1', null); // free period
    expect(d.classes[0].slots).toEqual([]);
    expect(d.classes[2].slots).toHaveLength(1); // other years untouched
  });

  it('moves linked classes when a period changes', () => {
    const d = planner();
    assignPeriod(d, 'y', ['C1'], 'p2', 'math');
    editPeriod(d, 'y', 'p2', { start: '09:00', end: '09:50' });
    expect(d.classes[0].slots[0]).toMatchObject({ start: '09:00', end: '09:50' });
    expect(d.classes[2].slots[0].start).toBe('08:00');
    editPeriod(d, 'y', 'p2', { name: 'Advisory' });
    expect(d.years[0].periods[1].name).toBe('Advisory');
  });

  it('removing a period keeps class times but unlinks them', () => {
    const d = planner();
    assignPeriod(d, 'y', ['C1'], 'p1', 'math');
    removePeriod(d, 'y', 'p1');
    expect(d.years[0].periods.map((p) => p.id)).toEqual(['p2']);
    expect(d.classes[0].slots[0]).toEqual({ dayKey: 'C1', start: '08:00', end: '08:50' });
    expect(d.years[0].dayTypes[0].periodTimes).toEqual({ p2: null });
  });

  it('starts alternate days from the regular bell', () => {
    expect(periodTimesFrom(planner().years[0].periods)).toEqual({ p1: { start: '08:00', end: '08:50' }, p2: { start: '08:55', end: '09:45' } });
  });
});
