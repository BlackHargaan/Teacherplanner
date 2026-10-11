// Dates are handled as local ISO strings ("YYYY-MM-DD") to avoid timezone drift.

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
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

/** Monday of the week containing iso. */
export function startOfWeek(iso) {
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
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
