// Full-text search across every lesson the current teacher can see, in all
// school years, with the dates each lesson is (or was) taught.
import { canView, standardIndex } from './model.js';
import { buildCalendar } from './schedule.js';

const norm = (s) => String(s || '').toLowerCase();

/** Where each lesson appears: lessonId -> [{yearId, classId, index, date|null}] */
export function lessonPlacements(state, userId) {
  const out = {};
  for (const year of state.years) {
    const classes = state.classes.filter((c) => c.yearId === year.id);
    const cal = buildCalendar(year, classes);
    for (const cls of classes) {
      if (!canView(cls, userId)) continue;
      const meetings = cal.byClass[cls.id] || [];
      cls.sequence.forEach((id, index) => {
        if (!id) return;
        (out[id] ||= []).push({ yearId: year.id, classId: cls.id, index, date: meetings[index]?.date || null });
      });
    }
  }
  return out;
}

function snippet(text, term, radius = 60) {
  const i = norm(text).indexOf(term);
  if (i < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, i - radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, i + term.length + radius).trim()}${i + term.length + radius < text.length ? '…' : ''}`;
}

/**
 * Lessons matching every word of `query`.
 * Returns [{lesson, home, placements, snippet, field, titleMatch}] — best first.
 */
export function searchLessons(state, query, userId, placements = lessonPlacements(state, userId), today = '') {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const std = standardIndex(state);
  const containers = Object.fromEntries([...state.classes, ...state.banks].map((c) => [c.id, c]));
  const results = [];

  for (const lesson of Object.values(state.lessons)) {
    const home = containers[lesson.homeId];
    const placed = placements[lesson.id] || [];
    if (!(home && canView(home, userId)) && !placed.length) continue;

    const fields = [['Title', lesson.title || '']];
    for (const sec of home?.sections || []) {
      if (lesson.content?.[sec.id]) fields.push([sec.name, lesson.content[sec.id]]);
    }
    for (const id of lesson.standardIds || []) fields.push(['Standard', `${std[id]?.code || id} ${std[id]?.description || ''}`]);
    for (const [label, list] of [['Strategy', lesson.strategies], ['Differentiation', lesson.differentiation], ['Accommodation', lesson.accommodations]]) {
      for (const v of list || []) fields.push([label, v]);
    }
    for (const a of lesson.attachments || []) fields.push(['Attachment', `${a.name || ''} ${a.url || ''}`]);
    if (lesson.privateNotes?.[userId]) fields.push(['My notes', lesson.privateNotes[userId]]);

    const haystack = norm(fields.map(([, t]) => t).join('\n'));
    if (!terms.every((t) => haystack.includes(t))) continue;

    const hit = fields.find(([label, t]) => label !== 'Title' && norm(t).includes(terms[0])) || fields.find(([, t]) => norm(t).includes(terms[0]));
    const titleMatch = terms.some((t) => norm(lesson.title).includes(t));
    results.push({
      lesson,
      home,
      placements: [...placed].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')),
      field: hit?.[0],
      snippet: hit && hit[0] !== 'Title' ? snippet(hit[1], terms[0]) : '',
      titleMatch,
    });
  }

  // Title matches first, then lessons taught closest to today.
  const distance = (r) => {
    const dates = r.placements.map((p) => p.date).filter(Boolean);
    if (!dates.length || !today) return Infinity;
    return Math.min(...dates.map((d) => Math.abs(new Date(d) - new Date(today))));
  };
  return results.sort((a, b) => (b.titleMatch - a.titleMatch) || (distance(a) - distance(b)) || (a.lesson.title || '').localeCompare(b.lesson.title || ''));
}
