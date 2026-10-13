import { gradingPeriodFor } from './schedule.js';

/**
 * Where today falls in the school year, for the sidebar:
 * { stage: 'before' | 'during' | 'after', day, total, percent, term }.
 * `days` are the year's school days ({ date }), in order.
 */
export function yearProgress(year, days, today) {
  const total = days.length;
  const term = gradingPeriodFor(year, today)?.name || null;
  if (!total || today < days[0].date) return { stage: 'before', day: 0, total, percent: 0, term, starts: days[0]?.date || year.start };
  if (today > days[total - 1].date) return { stage: 'after', day: total, total, percent: 100, term };
  const day = days.filter((d) => d.date <= today).length;
  return { stage: 'during', day, total, percent: Math.round((day / total) * 100), term };
}
