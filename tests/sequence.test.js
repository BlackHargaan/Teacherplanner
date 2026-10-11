import { describe, it, expect } from 'vitest';
import { bump, pullBack, extend, move, insertAt, place, clearAt, swap } from '../src/lib/sequence.js';

describe('sequence operations', () => {
  const seq = ['a', 'b', 'c'];
  it('bump inserts empty days', () => {
    expect(bump(seq, 1)).toEqual(['a', null, 'b', 'c']);
    expect(bump(seq, 0, 2)).toEqual([null, null, 'a', 'b', 'c']);
    expect(bump(seq, 5)).toEqual(['a', 'b', 'c']);
  });
  it('pullBack removes a day and shifts back', () => {
    expect(pullBack(seq, 0)).toEqual(['b', 'c']);
    expect(pullBack([null, 'a'], 0)).toEqual(['a']);
  });
  it('extend repeats a lesson', () => {
    expect(extend(seq, 1)).toEqual(['a', 'b', 'b', 'c']);
    expect(extend([null, 'a'], 0)).toEqual([null, 'a']);
  });
  it('move leaves the origin empty and bumps the target', () => {
    expect(move(seq, 0, 2)).toEqual([null, 'b', 'a', 'c']);
    expect(move(seq, 2, 0)).toEqual(['c', 'a', 'b']);
  });
  it('insert / place / clear / swap', () => {
    expect(insertAt(seq, 4, 'x')).toEqual(['a', 'b', 'c', null, 'x']);
    expect(place(seq, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(clearAt(seq, 2)).toEqual(['a', 'b']);
    expect(swap(seq, 0, 2)).toEqual(['c', 'b', 'a']);
  });
});
