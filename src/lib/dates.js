// Dates are handled as local ISO strings ("YYYY-MM-DD") to avoid timezone drift.

export function toISO(d) {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  // setFullYear, because new Date(2, …) means 1902: a year typed halfway
  // ("0002-08-24") must stay year 2, not jump to the 1900s.
  const date = new Date(2000, 0, 1);
  date.setFullYear(y, m - 1, d);
  return date;
}

/** A complete, real date ("2026-08-24") worth saving; not a year still being typed. */
export function isFullDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '') || Number(iso.slice(0, 4)) < 1900) return false;
  return toISO(fromISO(iso)) === iso;
}

/**
 * Why a first/last day pair can't be saved yet ('' when it can): each must be
 * a whole date from 1900 on, and the year can't end before it starts.
 */
export function dateRangeError(start, end) {
  if (!isFullDate(start) || !isFullDate(end)) return 'Enter full dates (year 1900 or later).';
  if (end < start) return 'The last day can’t be before the first day.';
  return '';
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function today() {
  return toISO(new Date());
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso) {
  return fromISO(iso).getDay();
}

/** First day of the week containing iso: Monday, or firstDow (0 = Sunday …). */
export function startOfWeek(iso, firstDow = 1) {
  return addDays(iso, -((dayOfWeek(iso) - firstDow + 7) % 7));
}

export function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

export function* eachDay(start, end) {
  for (let d = start; d <= end; d = addDays(d, 1)) yield d;
}

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return fromISO(iso).toLocaleDateString(undefined, opts);
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** On weekends, planning focuses on the upcoming week. */
export function planningAnchor(iso = today()) {
  const dow = dayOfWeek(iso);
  if (dow === 6) return addDays(iso, 2);
  if (dow === 0) return addDays(iso, 1);
  return iso;
}

export function shiftYear(iso, years) {
  const d = fromISO(iso);
  d.setFullYear(d.getFullYear() + years);
  return toISO(d);
}
