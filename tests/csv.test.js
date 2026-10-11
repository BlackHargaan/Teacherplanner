import { describe, it, expect } from 'vitest';
import { parseCSV, toCSV } from '../src/lib/csv.js';

describe('csv', () => {
  it('round-trips quoted fields', () => {
    const rows = [['code', 'description'], ['A.1', 'Says "hi", then\nleaves']];
    expect(parseCSV(toCSV(rows))).toEqual(rows);
  });
  it('handles CRLF and blank lines', () => {
    expect(parseCSV('a,b\r\n\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});
