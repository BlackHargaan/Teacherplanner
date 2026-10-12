import { useMemo } from 'react';
import { useStore } from '../lib/store.jsx';
import { useHashRoute, navigate } from '../lib/router.js';
import { lessonPlacements, searchLessons } from '../lib/search.js';
import { formatDate, today } from '../lib/dates.js';
import { StatusChips } from '../components/LessonContent.jsx';
import { Empty } from '../components/ui.jsx';

/** Wrap each search word in <mark>. */
function Highlight({ text, terms }) {
  if (!terms.length || !text) return text || null;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export default function Search() {
  const { state, update, userId } = useStore();
  const [, raw] = useHashRoute();
  const query = decodeURIComponent(raw || '');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const placements = useMemo(() => lessonPlacements(state, userId), [state.years, state.classes, userId]);
  const results = useMemo(() => searchLessons(state, query, userId, placements, today()), [state, query, userId, placements]);
  const years = Object.fromEntries(state.years.map((y) => [y.id, y]));
  const classes = Object.fromEntries(state.classes.map((c) => [c.id, c]));

  const open = (p) => {
    if (p.yearId !== state.currentYearId) update((d) => { d.currentYearId = p.yearId; });
    navigate(`planner/${p.date}/${p.classId}/${p.index}`);
  };

  return (
    <div className="page narrow-page">
      <div className="page-head"><h1>Search</h1></div>
      {!query.trim() && <Empty>Type in the search box at the top to find lessons by title, content, standard, strategy or attachment. Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd> to jump to search.</Empty>}
      {query.trim() && (
        <p className="small muted" role="status">{results.length === 0 ? `No lessons match “${query}”.` : `${results.length} lesson${results.length === 1 ? '' : 's'} match “${query}”.`}</p>
      )}
      <ul className="search-results">
        {results.slice(0, 200).map(({ lesson, home, placements: placed, field, snippet }) => (
          <li key={lesson.id} className="search-result" style={{ '--c': home?.color }}>
            <h3><Highlight text={lesson.title || 'Untitled lesson'} terms={terms} /></h3>
            <div className="row wrap small">
              <span className="muted">{home?.name}{lesson.homeType === 'bank' ? ' (lesson bank)' : ''}</span>
              <StatusChips ids={lesson.statusIds} />
            </div>
            {snippet && <p className="small"><span className="muted">{field}: </span><Highlight text={snippet} terms={terms} /></p>}
            <div className="search-dates">
              {placed.filter((p) => p.date).slice(0, 12).map((p) => (
                <a key={`${p.classId}-${p.index}`} href={`#/planner/${p.date}/${p.classId}/${p.index}`} onClick={(e) => { e.preventDefault(); open(p); }}>
                  {formatDate(p.date, { month: 'short', day: 'numeric', year: years[p.yearId]?.id === state.currentYearId ? undefined : 'numeric' })} · {classes[p.classId]?.name}
                </a>
              ))}
              {placed.some((p) => !p.date) && <span className="small muted">Not scheduled yet</span>}
              {!placed.length && lesson.homeType === 'bank' && <a href="#/collaborate">Open lesson bank</a>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
