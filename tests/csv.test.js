import { describe, it, expect } from 'vitest';
import { parseCSV, toCSV, toCSVFile } from '../src/lib/csv.js';

describe('csv', () => {
  it('round-trips quoted fields', () => {
    const rows = [['code', 'description'], ['A.1', 'Says "hi", then\nleaves']];
    expect(parseCSV(toCSV(rows))).toEqual(rows);
  });
  it('handles CRLF and blank lines', () => {
    expect(parseCSV('a,b\r\n\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('csv downloads', () => {
  it('starts with a UTF-8 byte-order mark and uses CRLF', () => {
    const text = toCSVFile([['Name'], ['José']]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1)).toBe('Name\r\nJosé');
    expect(parseCSV(text)).toEqual([['Name'], ['José']]);
  });

  it('quotes commas, quotes, and line breaks (including a lone CR)', () => {
    expect(toCSV([['a,b', 'say "hi"', 'one\rtwo', 'x\ny']])).toBe('"a,b","say ""hi""","one\rtwo","x\ny"');
  });

  it('keeps text that looks like a formula from running in a spreadsheet', () => {
    const out = toCSV([['=HYPERLINK("http://x")', '+1+1', '-cmd', '@SUM(A1)', '\tx', '\rx', 'ok']]);
    expect(out).toBe(`"'=HYPERLINK(""http://x"")",'+1+1,'-cmd,'@SUM(A1),'\tx,"'\rx",ok`);
  });

  it('leaves plain numbers alone', () => {
    expect(toCSV([[-5, '-5', '+3', '-2.5', '1e3', 0]])).toBe('-5,-5,+3,-2.5,1e3,0');
  });

  it('reads guarded cells back as typed', () => {
    const rows = [['=1+1', '-x', "'already quoted", '-5']];
    expect(parseCSV(toCSVFile(rows))).toEqual(rows);
  });
});
