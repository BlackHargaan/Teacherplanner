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
