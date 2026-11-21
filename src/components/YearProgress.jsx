import { useStore } from '../lib/store.jsx';
import { yearProgress } from '../lib/yearProgress.js';
import { formatDate, today } from '../lib/dates.js';

/** Where today falls in the school year, e.g. "Day 62 of 196 · Quarter 2" (shown on the planner). */
export function YearProgress() {
  const { year, calendar } = useStore();
  const p = year && calendar ? yearProgress(year, calendar.days, today()) : null;
  // Only once the teacher has set up the calendar; before that the count means nothing.
  if (!p || !p.total || (year.draft && !year.school)) return null;
  return (
    <span className="year-progress" title={year.name}>
      {p.stage === 'before' && `${year.name} starts ${formatDate(p.starts, { month: 'short', day: 'numeric' })} · ${p.total} school days`}
      {p.stage === 'during' && `Day ${p.day} of ${p.total}${p.term ? ` · ${p.term}` : ''}`}
      {p.stage === 'after' && `${year.name} finished · ${p.total} school days`}
    </span>
  );
}
