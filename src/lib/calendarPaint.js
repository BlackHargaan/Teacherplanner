// Painting the year calendar: teachers pick a brush (No school, Teacher
// workday, Cancelled, an alternate day, a rotation day…) and click or drag
// across dates. No-school days are stored as ranges, so painting splits and
// re-merges them; weekends inside a break don't interrupt it.
import { addDays, dayOfWeek } from './dates.js';

/** date -> { label, kind } for every school-week day inside a no-school range. */
export function offDayMap(year) {
  const weekdays = new Set(year.weekdays || [1, 2, 3, 4, 5]);
  const map = new Map();
  for (const r of year.nonSchoolDays || []) {
    for (let d = r.start; d <= (r.end || r.start); d = addDays(d, 1)) {
      if (weekdays.has(dayOfWeek(d))) map.set(d, { label: r.label || 'No school', kind: r.kind || 'holiday' });
    }
  }
  return map;
}

/** Turn a date map back into ranges, joining days separated only by weekends. */
export function rangesFromMap(map, weekdays = [1, 2, 3, 4, 5]) {
  const week = new Set(weekdays);
  const nextSchoolWeekday = (d) => {
    let n = addDays(d, 1);
    for (let i = 0; i < 7 && !week.has(dayOfWeek(n)); i += 1) n = addDays(n, 1);
    return n;
  };
  const ranges = [];
  for (const date of [...map.keys()].sort()) {
    const { label, kind } = map.get(date);
    const last = ranges.at(-1);
    if (last && last.label === label && (last.kind || 'holiday') === kind && nextSchoolWeekday(last.end || last.start) === date) {
      last.end = date;
    } else {
      ranges.push({ start: date, end: date, label, ...(kind !== 'holiday' ? { kind } : {}) });
    }
  }
  return ranges.map((r) => (r.end === r.start ? { ...r, end: undefined } : r));
}

/**
 * Apply a brush to dates (mutates the year draft).
 * brush: { kind: 'school' }                       regular school day
 *        { kind: 'holiday'|'workday'|'cancelled', label }
 *        { kind: 'dayType', id }                  an alternate day schedule
 *        { kind: 'rotation', key }                e.g. 'C2' = "this is Day 2"
 *        { kind: 'clearRotation' }
 */
export function paintDates(year, dates, brush) {
  year.dayAssignments ||= {};
  year.rotationOverrides ||= {};
  const weekdays = new Set(year.weekdays || [1, 2, 3, 4, 5]);
  const schoolWeek = dates.filter((d) => weekdays.has(dayOfWeek(d))); // weekends stay as they are
  if (brush.kind === 'rotation') {
    for (const d of schoolWeek) year.rotationOverrides[d] = brush.key;
    return;
  }
  if (brush.kind === 'clearRotation') {
    for (const d of dates) delete year.rotationOverrides[d];
    return;
  }
  const off = offDayMap(year);
  for (const d of schoolWeek) {
    off.delete(d);
    // A cancelled day keeps its alternate schedule: in a rotation, whether
    // that day counted decides whether the cycle moves on.
    if (brush.kind !== 'cancelled') delete year.dayAssignments[d];
    if (brush.kind === 'holiday' || brush.kind === 'workday' || brush.kind === 'cancelled') {
      off.set(d, { label: brush.label || defaultLabel(brush.kind), kind: brush.kind });
    } else if (brush.kind === 'dayType') {
      year.dayAssignments[d] = brush.id;
    }
  }
  year.nonSchoolDays = rangesFromMap(off, year.weekdays);
}

export const defaultLabel = (kind) => ({ holiday: 'No school', workday: 'Teacher workday', cancelled: 'Cancelled' }[kind] || 'No school');

/** Every date from a to b inclusive (either order). */
export function datesBetween(a, b) {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
