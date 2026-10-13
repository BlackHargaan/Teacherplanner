// Importing a district calendar (.ics file or calendar link) into a school
// year. District feeds mix what matters to class plans (first day, breaks,
// workdays, early release, quarter ends) with everything else (birthdays,
// meetings, testing windows), so events are classified by name and the
// teacher reviews the result before anything changes.
import { addDays, dayOfWeek } from './dates.js';
import { datesBetween, offDayMap, paintDates } from './calendarPaint.js';

// ---------------------------------------------------------------- parsing

const unescapeText = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** "20261222" or "20261222T153000Z" -> { date: '2026-12-22', time: '15:30' | null } */
function parseStamp(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?/.exec(value || '');
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
}

/** Parse the VEVENTs of an iCalendar file. All-day end dates become inclusive. */
export function parseICS(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { props: {}, exdates: [] }; continue; }
    if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    const key = name.toUpperCase();
    if (key === 'EXDATE') {
      for (const v of value.split(',')) { const s = parseStamp(v); if (s) cur.exdates.push(s.date); }
    } else if (!(key in cur.props)) {
      cur.props[key] = { value, params: params.map((p) => p.toUpperCase()) };
    }
  }
  return events.map((e, i) => {
    const p = e.props;
    const start = parseStamp(p.DTSTART?.value);
    if (!start) return null;
    const endStamp = parseStamp(p.DTEND?.value);
    const allDay = !start.time || p.DTSTART.params.includes('VALUE=DATE');
    let end = start.date;
    if (endStamp) end = allDay ? addDays(endStamp.date, -1) : endStamp.date;
    if (end < start.date) end = start.date;
    return {
      uid: p.UID?.value || `event-${i}`,
      summary: unescapeText(p.SUMMARY?.value || ''),
      start: start.date,
      end,
      allDay,
      rrule: p.RRULE?.value || null,
      exdates: e.exdates,
      recurrenceId: p['RECURRENCE-ID']?.value || null,
      cancelled: (p.STATUS?.value || '').toUpperCase() === 'CANCELLED',
    };
  }).filter(Boolean);
}

const DAY_CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Occurrences of an event between from and to (inclusive dates). */
export function occurrences(event, from, to) {
  const length = Math.round((Date.parse(event.end) - Date.parse(event.start)) / 86400000);
  const span = (d) => ({ ...event, start: d, end: addDays(d, length) });
  if (!event.rrule) return event.end >= from && event.start <= to ? [event] : [];
  const rule = Object.fromEntries(event.rrule.split(';').map((part) => part.split('=')));
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const until = parseStamp(rule.UNTIL)?.date || '9999-12-31';
  const limit = Number(rule.COUNT) || Infinity;
  const days = rule.BYDAY ? rule.BYDAY.split(',').map((c) => DAY_CODES[c.slice(-2)]) : [dayOfWeek(event.start)];
  const out = [];
  let count = 0;
  const keep = (d) => {
    count += 1;
    if (d >= from && d <= to && !event.exdates.includes(d)) out.push(span(d));
  };
  if (freq === 'YEARLY') {
    for (let y = Number(event.start.slice(0, 4)); count < limit; y += interval) {
      const d = `${y}${event.start.slice(4)}`;
      if (d > until || d > to) break;
      keep(d);
    }
  } else if (freq === 'WEEKLY' || freq === 'DAILY') {
    const step = freq === 'DAILY' ? 1 : 7;
    for (let base = event.start, n = 0; count < limit && n < 2000; base = addDays(base, step * interval), n += 1) {
      if (base > until || base > to) break;
      if (freq === 'DAILY') { keep(base); continue; }
      const weekStart = addDays(base, -dayOfWeek(base));
      for (const dow of [...days].sort()) {
        const d = addDays(weekStart, dow);
        if (d < event.start || d > until || count >= limit) continue;
        keep(d);
      }
    }
  } else if (event.end >= from && event.start <= to) {
    out.push(event); // monthly and rarer rules: first occurrence only
  }
  return out;
}

// ---------------------------------------------------------------- classifying

export const USES = {
  holiday: 'No school',
  workday: 'Teacher workday',
  cancelled: 'Cancelled day',
  early: 'Early release',
  firstDay: 'First day of school',
  lastDay: 'Last day of school',
  termEnd: 'Grading period ends',
  rotation: 'Rotation day',
  ignore: 'Ignore',
};

const TERM_END = /\b(quarter|semester|trimester|grading period|marking period|nine weeks|9 weeks)\s+(ends?|closes)\b|\bend(s)? of (the )?(1st |2nd |3rd |4th |first |second |third |fourth )?(quarter|semester|trimester|grading period|marking period|nine weeks|9 weeks)\b/i;

// "Holiday Store", "Winter Break Party": an event during school, not a day off.
const EVENT_WORDS = /\b(store|shop|party|concert|program|performance|show|sale|parade|dance|celebration|luncheon|feast|market|drive|bingo|camp|club|meeting)\b/;

/**
 * What an event means for class plans, from its name.
 * Returns { use, termEnd } — termEnd can ride along with another use
 * ("Early Out / End of Quarter").
 */
export function classify(summary, allDay = true) {
  const s = summary.toLowerCase();
  const termEnd = TERM_END.test(summary);
  let use = 'ignore';
  if (/\b(first|1st) day (of|for) (school|students|classes)\b|^first day$/.test(s)) use = 'firstDay';
  else if (/\blast day (of|for) (school|students|classes)\b|^last day$/.test(s)) use = 'lastDay';
  else if (/\bearly (out|release|dismissal)\b|\bhalf[- ]day\b|\bminimum day\b/.test(s)) use = 'early';
  else if (/\b(snow|inclement weather|weather day|emergency closing|school(s)? closed due)\b/.test(s)) use = 'cancelled';
  else if (/\b(teacher )?work ?day\b|\brecords day\b|\b(pd|professional (development|learning)|staff development) day\b/.test(s)) use = 'workday';
  else if (/\b(holiday|no school|no students|schools? closed|break|vacation|recess)\b/.test(s) && !EVENT_WORDS.test(s)) use = 'holiday';
  else if (/^(day [1-9]|[a-f] day)$/.test(s)) use = 'rotation';
  else if (termEnd) use = 'termEnd';
  // A timed "Christmas Break Party" isn't a day off; only strong signals count for timed events.
  if (!allDay && !['early', 'cancelled'].includes(use)) use = termEnd ? 'termEnd' : 'ignore';
  return { use, termEnd };
}

/** Clean up an event name for use as a label: "Christmas Break!!!" -> "Christmas Break". */
export const cleanLabel = (summary) => summary.replace(/[!?.\s]+$/, '').replace(/\s+/g, ' ').trim() || 'No school';

// ---------------------------------------------------------------- planning

/** School years (July–June) that contain any useful events, newest first. */
export function schoolYearsIn(events) {
  const counts = {};
  for (const e of events) {
    if (e.rrule || e.cancelled || classify(e.summary, e.allDay).use === 'ignore') continue;
    const y = Number(e.start.slice(0, 4)) - (Number(e.start.slice(5, 7)) < 7 ? 1 : 0);
    counts[y] = (counts[y] || 0) + 1;
  }
  return Object.keys(counts).map(Number).sort((a, b) => b - a).map((y) => ({ startYear: y, label: `${y}–${String(y + 1).slice(2)}`, from: `${y}-07-01`, to: `${y + 1}-06-30`, count: counts[y] }));
}

/**
 * Rows for the review screen: every event occurrence in the window, with a
 * suggested use. Rows are sorted by date; `shown` hides the noise.
 */
export function importRows(events, from, to) {
  // One occurrence of a repeating event changed or cancelled in the calendar
  // (RECURRENCE-ID) replaces the date the repeat would have produced.
  const replaced = new Map();
  for (const e of events) {
    const date = e.recurrenceId && parseStamp(e.recurrenceId)?.date;
    if (!date) continue;
    if (!replaced.has(e.uid)) replaced.set(e.uid, new Set());
    replaced.get(e.uid).add(date);
  }
  const rows = [];
  for (const e of events) {
    if (e.cancelled) continue;
    for (const o of occurrences(e, from, to)) {
      if (e.rrule && replaced.get(e.uid)?.has(o.start)) continue;
      const { use, termEnd } = classify(o.summary, o.allDay);
      rows.push({
        key: `${o.uid}|${o.recurrenceId || ''}|${o.start}`,
        summary: o.summary,
        start: o.start,
        end: o.end,
        allDay: o.allDay,
        recurring: Boolean(o.rrule),
        use,
        termEnd,
        suggested: use !== 'ignore' || termEnd,
      });
    }
  }
  // The same event listed twice on a date shows once.
  const seen = new Set();
  return rows
    .sort((a, b) => a.start.localeCompare(b.start) || a.summary.localeCompare(b.summary))
    .filter((r) => {
      const k = `${r.start}|${r.summary}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const ORDINALS = { '1st': 1, first: 1, '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4 };
const TERM_COUNT = { Quarter: 4, Trimester: 3, Semester: 2 };

/** "1st Quarter Ends" -> { type: 'Quarter', n: 1 } */
function termName(summary) {
  const m = /\b(1st|2nd|3rd|4th|first|second|third|fourth)?\s*(quarter|semester|trimester|nine weeks|9 weeks|grading period|marking period)\b/i.exec(summary);
  if (!m) return { type: 'Quarter', n: null };
  const word = m[2].toLowerCase();
  const type = word.startsWith('sem') ? 'Semester' : word.startsWith('tri') ? 'Trimester' : 'Quarter';
  return { type, n: m[1] ? ORDINALS[m[1].toLowerCase()] : null };
}

/**
 * Grading periods from "Quarter ends" events: each period runs from the day
 * after the previous end. District calendars are often filled in during the
 * year, so a final period up to the last day is only added when exactly one
 * is missing (e.g. "3rd Quarter Ends" found, 4th quarter = rest of the year).
 */
export function termsFromEnds(endRows, yearStart, yearEnd) {
  const ends = [...new Map(endRows.filter((r) => r.end >= yearStart).map((r) => [r.end, r])).values()].sort((a, b) => a.end.localeCompare(b.end));
  if (!ends.length) return [];
  const { type } = termName(ends[0].summary);
  const terms = ends.map((r, i) => ({ name: `${type} ${termName(r.summary).n || i + 1}`, end: r.end }));
  if (yearEnd && terms.at(-1).end < yearEnd && terms.length + 1 === TERM_COUNT[type]) terms.push({ name: `${type} ${TERM_COUNT[type]}`, end: yearEnd });
  return terms.map((t, i) => ({ name: t.name, start: i === 0 ? yearStart : addDays(terms[i - 1].end, 1), end: t.end }));
}

/**
 * Apply reviewed rows to a year (mutates the draft). Returns counts for the
 * confirmation message.
 * opts: { setBounds, makeTerms, earlyTypeId, makeId, replaceDaysOff }
 * replaceDaysOff clears breaks and workdays already in the year first (a
 * re-import after the district changes its calendar); cancelled days stay.
 */
export function applyImport(year, rows, opts = {}) {
  const counts = { off: 0, early: 0, rotation: 0, terms: 0, start: null, end: null };
  if (opts.replaceDaysOff) year.nonSchoolDays = (year.nonSchoolDays || []).filter((r) => r.kind === 'cancelled');
  const use = rows.filter((r) => r.use !== 'ignore' || r.termEnd);
  if (opts.setBounds) {
    const first = use.find((r) => r.use === 'firstDay');
    const last = [...use].reverse().find((r) => r.use === 'lastDay');
    if (first) year.start = counts.start = first.start;
    if (last) year.end = counts.end = last.end;
  }
  const weekdays = new Set(year.weekdays || [1, 2, 3, 4, 5]);
  // Only days inside the school year matter (workdays before the first day don't).
  const schoolDaysOf = (r) => datesBetween(r.start, r.end).filter((d) => weekdays.has(dayOfWeek(d)) && d >= year.start && d <= year.end);
  // Days off win over anything else on the same date (a weekly "Early
  // Release Wednesday" still falls inside winter break), so apply them last.
  const offFirst = (r) => (['holiday', 'workday', 'cancelled'].includes(r.use) ? 1 : 0);
  for (const r of [...use].sort((a, b) => offFirst(a) - offFirst(b))) {
    if (['holiday', 'workday', 'cancelled'].includes(r.use)) {
      const dates = schoolDaysOf(r);
      paintDates(year, dates, { kind: r.use, label: cleanLabel(r.summary) });
      counts.off += dates.length;
    } else if (r.use === 'early' && opts.earlyTypeId) {
      // Never turn a day off (a kept snow day or break) back into a school day.
      const off = offDayMap(year);
      paintDates(year, schoolDaysOf(r).filter((d) => !off.has(d)), { kind: 'dayType', id: opts.earlyTypeId });
    } else if (r.use === 'rotation' && year.scheduleType === 'cycle') {
      const s = r.summary.trim().toLowerCase();
      const n = s.startsWith('day') ? Number(s.slice(4)) : s.charCodeAt(0) - 96;
      if (n >= 1 && n <= (year.cycleLength || 6)) {
        paintDates(year, [r.start], { kind: 'rotation', key: `C${n}` });
        counts.rotation += 1;
      }
    }
  }
  if (opts.earlyTypeId) counts.early = Object.values(year.dayAssignments || {}).filter((id) => id === opts.earlyTypeId).length;
  if (opts.makeTerms) {
    const terms = termsFromEnds(use.filter((r) => r.termEnd || r.use === 'termEnd'), year.start, year.end);
    if (terms.length) {
      year.gradingPeriods = terms.map((t) => ({ id: opts.makeId ? opts.makeId() : `term-${t.end}`, ...t }));
      counts.terms = terms.length;
    }
  }
  return counts;
}

// ---------------------------------------------------------------- links

/**
 * Turn the links teachers actually find into an .ics address:
 * webcal:// links, Google Calendar embed (?src=) and "add calendar" (?cid=)
 * links. Returns null for something that isn't a web address.
 */
export function normalizeCalendarUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) return null;
  if (/^webcals?:\/\//i.test(raw)) raw = raw.replace(/^webcals?:\/\//i, 'https://');
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (url.hostname === 'calendar.google.com' && !url.pathname.includes('/ical/')) {
    let id = url.searchParams.get('src');
    const cid = url.searchParams.get('cid');
    if (!id && cid) {
      try { id = atob(cid.replace(/-/g, '+').replace(/_/g, '/')); } catch { id = cid; }
    }
    if (id) return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
  }
  return url.toString();
}

/** Download a calendar. The desktop app fetches it itself (no browser CORS limits). */
export async function downloadCalendar(input, host = typeof window !== 'undefined' ? window.plannerHost : null) {
  const url = normalizeCalendarUrl(input);
  if (!url) throw new Error('That doesn’t look like a calendar link.');
  let text;
  if (host?.fetchCalendar) {
    try {
      text = await host.fetchCalendar(url);
    } catch (err) {
      const msg = String(err?.message || '').replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
      throw new Error(/net::|abort|timeout|fetch failed/i.test(msg) ? 'Couldn’t reach that calendar. Check your internet connection and the link.' : msg);
    }
  } else {
    let res;
    try { res = await fetch(url); } catch {
      throw new Error('Couldn’t download that calendar here. Download the .ics file instead and choose it with “Choose file”.');
    }
    if (!res.ok) throw new Error(`The calendar couldn’t be downloaded (error ${res.status}). Check that it’s shared publicly.`);
    text = await res.text();
  }
  if (!/BEGIN:VCALENDAR/.test(text || '')) throw new Error('That link didn’t return a calendar. Use the calendar’s “iCal” or “.ics” link.');
  return { url, text };
}
