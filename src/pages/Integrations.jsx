import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canView, lessonHome } from '../lib/model.js';
import { buildICS, classroomShareLink, googleCalendarLink } from '../lib/ics.js';
import { addDays, formatDate, formatTime, today } from '../lib/dates.js';
import { Chip, Field, download } from '../components/ui.jsx';

function describe(state, lesson) {
  if (!lesson) return '';
  const home = lessonHome(state, lesson);
  const parts = (home?.sections || []).filter((s) => !s.hidden && lesson.content[s.id]).map((s) => `${s.name}: ${lesson.content[s.id]}`);
  for (const a of lesson.attachments || []) if (a.url) parts.push(`${a.name}: ${a.url}`);
  return parts.join('\n\n');
}

export default function Integrations() {
  const { state, calendar, classes, userId, year } = useStore();
  const visible = classes.filter((c) => canView(c, userId));
  const [classIds, setClassIds] = useState(visible.map((c) => c.id));
  const [start, setStart] = useState(today() < year.start ? year.start : today());
  const [end, setEnd] = useState(year.end);
  const [onlyLessons, setOnlyLessons] = useState(false);

  const events = useMemo(() => visible.filter((c) => classIds.includes(c.id)).flatMap((cls) =>
    (calendar.byClass[cls.id] || []).filter((m) => m.date >= start && m.date <= end).map((m) => {
      const lesson = state.lessons[cls.sequence[m.index]];
      return {
        uid: `${cls.id}-${m.date}-${m.start}@teacher-planner`,
        date: m.date, start: m.start, end: m.end,
        title: lesson?.title ? `${cls.name}: ${lesson.title}` : cls.name,
        description: describe(state, lesson),
        location: cls.room,
        lesson, cls,
      };
    }).filter((e) => !onlyLessons || e.lesson)), [visible, classIds, calendar, start, end, state, onlyLessons]);

  const upcoming = events.filter((e) => e.date >= today() && e.date <= addDays(today(), 7)).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const attachments = upcoming.flatMap((e) => (e.lesson?.attachments || []).filter((a) => a.url).map((a) => ({ ...a, e })));

  return (
    <div className="page">
      <div className="page-head"><h1>Google Integration</h1></div>
      <div className="cards">
        <section className="card wide">
          <h2>Google Calendar</h2>
          <p className="small">Export your class schedule with lesson titles and details as an <code>.ics</code> file, then in Google Calendar choose <em>Settings → Import &amp; export → Import</em>. Re-export after big schedule changes (events keep stable IDs, so re-importing updates them).</p>
          <div className="chips">
            {visible.map((c) => <Chip key={c.id} color={c.color} active={classIds.includes(c.id)} onClick={() => setClassIds(classIds.includes(c.id) ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])}>{c.name}</Chip>)}
          </div>
          <div className="row wrap">
            <Field label="From"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="To"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <label className="row small"><input type="checkbox" checked={onlyLessons} onChange={(e) => setOnlyLessons(e.target.checked)} /> Only days with a lesson</label>
            <button className="primary" disabled={!events.length} onClick={() => download(`${year.name}.ics`, buildICS(events, year.name), 'text/calendar')}>Download .ics ({events.length} events)</button>
          </div>
          <h3>This week — add individual lessons</h3>
          <ul className="list">
            {upcoming.map((e) => (
              <li key={e.uid}>
                <span className="dot" style={{ background: e.cls.color }} />
                <span className="nowrap">{formatDate(e.date)} {formatTime(e.start)}</span>
                <span className="grow">{e.title}</span>
                <a href={googleCalendarLink(e)} target="_blank" rel="noreferrer">Add to Google Calendar</a>
              </li>
            ))}
            {upcoming.length === 0 && <li className="muted">No classes in the next 7 days.</li>}
          </ul>
        </section>

        <section className="card">
          <h2>Google Classroom</h2>
          <p className="small">Post this week’s lesson links and attachments to Classroom as an assignment, material or announcement with one click.</p>
          <ul className="list">
            {attachments.map((a) => (
              <li key={`${a.e.uid}-${a.id}`}>
                <span className="grow">{a.e.cls.name}: {a.name}</span>
                <a href={classroomShareLink(a.url, `${a.e.title} — ${a.name}`)} target="_blank" rel="noreferrer">Share to Classroom</a>
              </li>
            ))}
            {attachments.length === 0 && <li className="muted small">No link attachments on lessons in the next 7 days.</li>}
          </ul>
        </section>

        <section className="card">
          <h2>Google Drive</h2>
          <p className="small">Attach Drive files to lessons with the <strong>Google Drive</strong> attachment type — paste the file’s share link. Large files (over 1.5&nbsp;MB) should always live in Drive rather than in the planner.</p>
          <p className="small">To keep a copy of your plans in Drive, use <a href="#/views">Shared Views → Download page</a> or <a href="#/settings">Settings → Export backup</a> and upload the file.</p>
        </section>
      </div>
    </div>
  );
}
