// Schedule engine: turns a school-year definition + class time slots into a
// concrete calendar of class meetings. Everything downstream (lesson
// placement, bumping, reports, shared views) is derived from this.
import { addDays, dayOfWeek, diffDays, eachDay, startOfWeek, DOW_SHORT } from './dates.js';

export const SCHEDULE_TYPES = {
  weekly: 'Weekly (same every week)',
  biweekly: 'Bi-weekly (A / B weeks)',
  cycle: 'Rotating cycle (Day 1, Day 2 …)',
};

/** All day keys a class slot can be attached to for this year. */
export function dayKeysFor(year) {
  const weekdays = [...(year.weekdays || [1, 2, 3, 4, 5])].sort();
  if (year.scheduleType === 'cycle') {
    return Array.from({ length: year.cycleLength || 6 }, (_, i) => `C${i + 1}`);
  }
  if (year.scheduleType === 'biweekly') {
    return [...weekdays.map((d) => `A${d}`), ...weekdays.map((d) => `B${d}`)];
  }
  return weekdays.map((d) => `W${d}`);
}

/** How rotation days are named: "Day 1, Day 2…" or "A Day, B Day…". */
export const CYCLE_NAMES = { numbers: 'Day 1, Day 2, Day 3…', letters: 'A Day, B Day, C Day…' };

export function dayKeyLabel(key, year) {
  if (!key) return '';
  const kind = key[0];
  const n = Number(key.slice(1));
  if (kind === 'C') return year?.cycleNames === 'letters' ? `${String.fromCharCode(64 + n)} Day` : `Day ${n}`;
  if (kind === 'A' || kind === 'B') return `${kind} ${DOW_SHORT[n]}`;
  return DOW_SHORT[n];
}

/** Kinds of days without classes. "cancelled" is a day lost after the fact (snow, power outage). */
export const NON_SCHOOL_KINDS = {
  holiday: 'No school',
  workday: 'Teacher workday',
  cancelled: 'Cancelled day',
};

/** What happens to a rotating schedule when a school day is cancelled. */
export const CANCELLED_ROTATION = {
  keep: 'Every date keeps its assigned day',
  shift: 'The rotation picks up where it left off',
};

export function isNonSchoolDay(year, date) {
  return (year.nonSchoolDays || []).find(
    (r) => date >= r.start && date <= (r.end || r.start),
  );
}

/**
 * Returns every school day in the year, with the day key that drives which
 * classes meet and any alternate day type assigned to it.
 */
export function schoolDays(year) {
  const weekdays = new Set(year.weekdays || [1, 2, 3, 4, 5]);
  const dayTypes = Object.fromEntries((year.dayTypes || []).map((t) => [t.id, t]));
  const assignments = year.dayAssignments || {};
  const firstWeek = startOfWeek(year.start);
  const cycleLength = Math.max(1, Number(year.cycleLength) || 6);
  const rotation = year.rotationOverrides || {};
  const cancelledKeepsDay = (year.cancelledDayRotation || 'keep') === 'keep';
  let cycleIndex = (Number(year.cycleStartDay) || 1) - 1;
  const days = [];
  if (!year.start || !year.end || year.end < year.start) return days;

  for (const date of eachDay(year.start, year.end)) {
    if (!weekdays.has(dayOfWeek(date))) continue;
    // A date marked "Day 3" on the district calendar is Day 3, and the
    // rotation continues from there.
    if (year.scheduleType === 'cycle' && rotation[date]) cycleIndex = Math.max(0, Number(String(rotation[date]).slice(1)) - 1);
    const off = isNonSchoolDay(year, date);
    if (off) {
      if (year.scheduleType === 'cycle' && off.kind === 'cancelled' && cancelledKeepsDay) cycleIndex += 1;
      continue;
    }
    const dayType = assignments[date] ? dayTypes[assignments[date]] : null;
    let dayKey;
    if (year.scheduleType === 'cycle') {
      dayKey = `C${(cycleIndex % cycleLength) + 1}`;
      if (!dayType || dayType.countsInRotation !== false) cycleIndex += 1;
    } else if (year.scheduleType === 'biweekly') {
      const week = Math.floor(diffDays(firstWeek, startOfWeek(date)) / 7);
      dayKey = `${week % 2 === 0 ? 'A' : 'B'}${dayOfWeek(date)}`;
    } else {
      dayKey = `W${dayOfWeek(date)}`;
    }
    days.push({ date, dayKey, dayType: dayType || null });
  }
  return days;
}

function meetingsForDay(day, classes, overrides) {
  let list;
  if (day.dayType?.periodTimes) {
    // Bell-based alternate day (early release, assembly): whichever classes
    // meet today keep their period, with that period's times for this day.
    const times = day.dayType.periodTimes;
    list = [];
    for (const c of classes) {
      for (const s of c.slots || []) {
        if (s.dayKey !== day.dayKey) continue;
        if (s.periodId && s.periodId in times) {
          if (times[s.periodId]) list.push({ classId: c.id, start: times[s.periodId].start, end: times[s.periodId].end, altDay: true });
        } else {
          list.push({ classId: c.id, start: s.start, end: s.end, altDay: true });
        }
      }
    }
  } else if (day.dayType) {
    const active = new Set(classes.map((c) => c.id));
    list = (day.dayType.slots || [])
      .filter((s) => active.has(s.classId))
      .map((s) => ({ classId: s.classId, start: s.start, end: s.end, altDay: true }));
  } else {
    list = [];
    for (const c of classes) {
      for (const s of c.slots || []) {
        if (s.dayKey === day.dayKey) list.push({ classId: c.id, start: s.start, end: s.end });
      }
    }
  }
  for (const o of overrides) {
    if (o.date !== day.date) continue;
    if (o.type === 'remove') list = list.filter((m) => m.classId !== o.classId);
    else if (o.type === 'add') {
      list.push({ classId: o.classId, start: o.start, end: o.end, extra: true, overrideId: o.id });
    }
  }
  return list.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

/**
 * Build the full calendar for a year.
 *  - days: [{date, dayKey, dayType, meetings:[{classId,start,end,index}]}]
 *  - byDate: date -> day
 *  - byClass: classId -> [{date,start,end,index}]  (index = position in the
 *    class's lesson sequence)
 */
export function buildCalendar(year, classes) {
  const overrides = year.overrides || [];
  const days = schoolDays(year);
  const byClass = Object.fromEntries(classes.map((c) => [c.id, []]));
  const byDate = {};
  for (const day of days) {
    day.meetings = meetingsForDay(day, classes, overrides);
    for (const m of day.meetings) {
      const list = byClass[m.classId];
      if (!list) continue;
      m.index = list.length;
      m.date = day.date;
      list.push(m);
    }
    byDate[day.date] = day;
  }
  return { days, byDate, byClass };
}

/** First meeting index for a class on or after the given date. */
export function meetingIndexOnOrAfter(calendar, classId, date) {
  const list = calendar.byClass[classId] || [];
  const found = list.find((m) => m.date >= date);
  return found ? found.index : list.length;
}

/** School days that fall inside [start, end]. */
export function daysInRange(calendar, start, end) {
  return calendar.days.filter((d) => d.date >= start && d.date <= end);
}

/** The grading period (quarter, semester…) a date falls in, if any. */
export function gradingPeriodFor(year, date) {
  return (year.gradingPeriods || []).find((p) => date >= p.start && date <= p.end) || null;
}

/**
 * Split the school days into `count` grading periods of (nearly) equal
 * length, e.g. 4 quarters or 2 semesters.
 */
export function splitGradingPeriods(year, count, name = 'Quarter') {
  const days = schoolDays(year);
  if (!days.length || count < 1) return [];
  return Array.from({ length: count }, (_, i) => {
    const from = Math.round((days.length * i) / count);
    const to = Math.round((days.length * (i + 1)) / count) - 1;
    return { name: `${name} ${i + 1}`, start: i === 0 ? year.start : days[from].date, end: i === count - 1 ? year.end : days[to].date };
  });
}

export function weekDates(anchor) {
  const monday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
