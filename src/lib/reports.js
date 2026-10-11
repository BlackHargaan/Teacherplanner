import { effectiveTemplateIds } from './model.js';

/**
 * Standards coverage: how often each standard was taught in a date range,
 * counting lesson standards and standards contributed by templates.
 * Returns { [standardId]: { count, dates:[...], classIds:Set } }
 */
export function standardsCoverage(state, calendar, classes, start, end) {
  const out = {};
  for (const cls of classes) {
    const tplStd = (lesson) => state.templates
      .filter((t) => effectiveTemplateIds(cls, lesson).includes(t.id))
      .flatMap((t) => t.standardIds || []);
    for (const m of calendar.byClass[cls.id] || []) {
      if (m.date < start || m.date > end) continue;
      const lesson = state.lessons[cls.sequence[m.index]];
      if (!lesson) continue;
      for (const id of new Set([...(lesson.standardIds || []), ...tplStd(lesson)])) {
        const e = out[id] || (out[id] = { count: 0, dates: [], classIds: new Set() });
        e.count += 1;
        e.dates.push(m.date);
        e.classIds.add(cls.id);
      }
    }
  }
  return out;
}

/** Latest standard score per student, plus the class average, for a date range. */
export function achievement(cls, standardId, start, end) {
  const latest = {};
  for (const s of cls.standardScores || []) {
    if (s.standardId !== standardId || s.date < start || s.date > end) continue;
    if (!latest[s.studentId] || latest[s.studentId].date <= s.date) latest[s.studentId] = s;
  }
  const scores = Object.values(latest).map((s) => Number(s.score));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { latest, avg };
}

/** Weighted gradebook average (%) for one student. */
export function studentAverage(gradebook, studentId) {
  const byCat = {};
  for (const a of gradebook.assignments) {
    const v = gradebook.scores?.[a.id]?.[studentId];
    if (v === '' || v == null || Number.isNaN(Number(v))) continue;
    const c = byCat[a.categoryId] || (byCat[a.categoryId] = { earned: 0, possible: 0 });
    c.earned += Number(v);
    c.possible += Number(a.points) || 0;
  }
  let total = 0;
  let weights = 0;
  for (const cat of gradebook.categories) {
    const c = byCat[cat.id];
    if (!c || !c.possible) continue;
    total += (c.earned / c.possible) * (Number(cat.weight) || 0);
    weights += Number(cat.weight) || 0;
  }
  return weights ? (total / weights) * 100 : null;
}

export function letterGrade(pct) {
  if (pct == null) return '';
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}
