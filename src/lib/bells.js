// Bell schedule: the school's periods and times, entered once per year.
// Class meeting times link to a period (slot.periodId), so changing a
// period's times moves every class that meets in it.
import { uid } from './model.js';

const toMinutes = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/** A new period starting a few minutes after the last one, the same length. */
export function nextPeriod(periods) {
  const last = periods.at(-1);
  if (!last) return { id: uid('period'), name: '1st Period', start: '08:00', end: '08:50' };
  const length = Math.max(10, toMinutes(last.end) - toMinutes(last.start));
  const start = toMinutes(last.end) + 5;
  const n = periods.length + 1;
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return { id: uid('period'), name: `${n}${suffix} Period`, start: fromMinutes(start), end: fromMinutes(start + length) };
}

const yearClassesOf = (d, yearId) => d.classes.filter((c) => c.yearId === yearId);

/** Change a period's name or times; linked class meeting times follow (mutates draft). */
export function editPeriod(d, yearId, periodId, patch) {
  const year = d.years.find((y) => y.id === yearId);
  const period = year.periods.find((p) => p.id === periodId);
  Object.assign(period, patch);
  if (!('start' in patch) && !('end' in patch)) return;
  for (const c of yearClassesOf(d, yearId)) {
    for (const s of c.slots) if (s.periodId === periodId) Object.assign(s, { start: period.start, end: period.end });
  }
}

/** Remove a period. Classes keep their meeting times, just no longer linked. */
export function removePeriod(d, yearId, periodId) {
  const year = d.years.find((y) => y.id === yearId);
  year.periods = year.periods.filter((p) => p.id !== periodId);
  for (const c of yearClassesOf(d, yearId)) for (const s of c.slots) if (s.periodId === periodId) delete s.periodId;
  for (const t of year.dayTypes || []) if (t.periodTimes) delete t.periodTimes[periodId];
}

/** The class that meets in a period on a day key, if any. */
export function classInPeriod(classes, dayKey, periodId) {
  return classes.find((c) => c.slots.some((s) => s.dayKey === dayKey && s.periodId === periodId)) || null;
}

/**
 * Put a class in a period on the given day keys (classId null = free
 * period). A class meets once per day, so its other time that day is
 * replaced. Mutates the draft.
 */
export function assignPeriod(d, yearId, dayKeys, periodId, classId) {
  const year = d.years.find((y) => y.id === yearId);
  const period = year.periods.find((p) => p.id === periodId);
  for (const key of dayKeys) {
    for (const c of yearClassesOf(d, yearId)) {
      c.slots = c.slots.filter((s) => !(s.dayKey === key && (s.periodId === periodId || c.id === classId)));
    }
    if (classId) {
      d.classes.find((c) => c.id === classId).slots.push({ dayKey: key, start: period.start, end: period.end, periodId });
    }
  }
}

/** Alternate-day times for each period, starting from the regular bell. */
export const periodTimesFrom = (periods) => Object.fromEntries(periods.map((p) => [p.id, { start: p.start, end: p.end }]));
