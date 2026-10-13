/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // byte-order mark from Excel / our exports
  const end = () => row.push(unguard(field));
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { end(); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      end(); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { end(); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Spreadsheet apps run cells that start with = + - @ as formulas, so a lesson
 * title or student name like "=HYPERLINK(…)" could do things when the file is
 * opened. Such text gets a leading apostrophe (shown as plain text); ordinary
 * numbers like -5 are left alone.
 */
function guard(s) {
  return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s;
}
/** Undo guard() when reading a CSV back in. */
function unguard(s) {
  return /^'[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s.slice(1)) ? s.slice(1) : s;
}

export function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    const s = typeof c === 'number' ? String(c) : guard(String(c ?? ''));
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

/** CSV text for a download: starts with a UTF-8 byte-order mark so Excel shows accents and other letters correctly. */
export function toCSVFile(rows) {
  return `\uFEFF${toCSV(rows)}`;
}
