import { describe, it, expect } from 'vitest';
import { createHistory, record, undo, redo, HISTORY_LIMIT } from '../src/lib/history.js';

describe('undo history', () => {
  it('undoes and redoes', () => {
    let h = createHistory();
    h = record(h, 'A', 1000);
    h = record(h, 'B', 5000);
    let r = undo(h, 'C');
    expect(r.state).toBe('B');
    r = undo(r.history, 'B');
    expect(r.state).toBe('A');
    expect(undo(r.history, 'A')).toBeNull();
    const again = redo(r.history, 'A');
    expect(again.state).toBe('B');
  });
  it('coalesces rapid changes into one step', () => {
    let h = createHistory();
    h = record(h, 'A', 1000);
    h = record(h, 'A1', 1200);
    h = record(h, 'A2', 1400);
    expect(h.past).toEqual(['A']);
    h = record(h, 'B', 4000);
    expect(h.past).toEqual(['A', 'B']);
  });
  it('a new change clears redo and the stack is capped', () => {
    let h = createHistory();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = record(h, i, i * 1000);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    const u = undo(h, 'now');
    expect(u.history.future.length).toBe(1);
    expect(record(u.history, 'x', 1e9).future).toEqual([]);
  });
});

describe('separate steps', () => {
  it('never merges a separate step into the previous one', () => {
    let h = record(createHistory(), 'A', 1000);
    h = record(h, 'B', 1100, true);
    expect(h.past).toEqual(['A', 'B']);
    h = record(h, 'C', 1200);
    expect(h.past).toEqual(['A', 'B', 'C']);
  });
});

describe('changes from teammates', () => {
  it('are applied to undo and redo steps so undo never rolls them back', async () => {
    const { applyToHistory } = await import('../src/lib/history.js');
    let h = createHistory();
    const s0 = { lessons: { x: 'old' } };
    const s1 = { lessons: { x: 'old' }, mine: 1 };
    h = record(h, s0, 1000);
    h = record(h, s1, 5000);
    const current = { lessons: { x: 'old' }, mine: 2 };
    const teammate = (d) => { d.lessons.x = 'teammate'; };
    teammate(current);
    applyToHistory(h, teammate);
    const r = undo(h, current);
    expect(r.state).toEqual({ lessons: { x: 'teammate' }, mine: 1 });
    expect(undo(r.history, r.state).state.lessons.x).toBe('teammate');
  });
  it('skips steps the change does not fit', async () => {
    const { applyToHistory } = await import('../src/lib/history.js');
    const h = record(record(createHistory(), { banks: [] }, 1000), { banks: [{ id: 'b' }] }, 5000);
    applyToHistory(h, (d) => { d.banks.find((b) => b.id === 'b').shared = true; });
    expect(h.past).toEqual([{ banks: [] }, { banks: [{ id: 'b', shared: true }] }]);
  });
});
