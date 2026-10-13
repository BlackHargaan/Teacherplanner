import { describe, it, expect } from 'vitest';
import { gridSize, pruneSeats, seatedIds, seatsOutsideGrid } from '../src/lib/seating.js';

describe('seating chart grid', () => {
  const chart = () => ({ rows: 2, cols: 2, seats: { '0-0': 'a', '1-1': 'b', '2-0': 'c', '0-3': 'd' } });

  it('only counts students at desks on the grid as seated', () => {
    expect([...seatedIds(chart())].sort()).toEqual(['a', 'b']);
    expect(seatsOutsideGrid(chart()).sort()).toEqual(['0-3', '2-0']);
  });

  it('unseats students left outside after the grid shrinks', () => {
    const c = pruneSeats(chart());
    expect(c.seats).toEqual({ '0-0': 'a', '1-1': 'b' });
  });

  it('accepts 1 to 15 rows or columns only', () => {
    expect(gridSize('4')).toBe(4);
    expect(gridSize('')).toBeNull();
    expect(gridSize('0')).toBeNull();
    expect(gridSize('16')).toBeNull();
    expect(gridSize('2.5')).toBeNull();
  });
});
