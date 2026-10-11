import { useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoreContext, useStore } from '../lib/store.jsx';
import { canView, makeView } from '../lib/model.js';
import { addDays, formatDate, formatTime, planningAnchor, startOfWeek, today } from '../lib/dates.js';
import { VIEW_AUDIENCES } from '../data/presets.js';
import { LessonContent, StatusChips } from '../components/LessonContent.jsx';
import { Chip, Empty, Field, download } from '../components/ui.jsx';

const PRESETS = {
  student: { dateMode: 'week', showStandards: false, showSubNotes: false, allowSubNotes: false },
  parent: { dateMode: 'week', showStandards: true, showSubNotes: false, allowSubNotes: false },
  substitute: { dateMode: 'day', showStandards: true, showSubNotes: true, allowSubNotes: true, statusIds: [] },
  team: { dateMode: 'range', pastDays: 14, futureDays: 28, showStandards: true, showSubNotes: true },
  admin: { dateMode: 'range', pastDays: 30, futureDays: 30, showStandards: true, showSubNotes: false },
};

export default function Views() {
  const { state, update, userId, classes, notify } = useStore();
  const views = state.views.filter((v) => v.ownerId === userId);
  const [selected, setSelected] = useState(views[0]?.id);
  const view = views.find((v) => v.id === selected);
  const edit = (fn) => update((d) => fn(d.views.find((v) => v.id === selected)));
  const myClasses = classes.filter((c) => canView(c, userId));
  const sectionNames = useMemo(() => {
    const names = new Set();
    for (const c of myClasses.filter((x) => view?.classIds.includes(x.id))) for (const s of c.sections) if (!s.hidden) names.add(s.name);
    return [...names];
  }, [myClasses, view]);

  const add = (audience) => {
    const v = makeView({ ownerId: userId, audience, name: `${VIEW_AUDIENCES[audience]} view`, classIds: myClasses.map((c) => c.id), ...PRESETS[audience] });
    update((d) => { d.views.push(v); });
    setSelected(v.id);
  };

  return (
    <div className="page split">
      <aside className="side-list">
        <h1>Shared Views</h1>
        <p className="small muted">Control exactly what students, families, substitutes, teammates and administrators see.</p>
        {views.map((v) => (
          <button key={v.id} className={`side-item ${v.id === selected ? 'on' : ''}`} onClick={() => setSelected(v.id)}>
            <span className="grow">{v.name}<br /><span className="small muted">{VIEW_AUDIENCES[v.audience]}</span></span>
          </button>
        ))}
        <Field label="New view for…">
          <select value="" onChange={(e) => e.target.value && add(e.target.value)}>
            <option value="">Choose audience…</option>
            {Object.entries(VIEW_AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </aside>
      {view ? (
        <section className="detail">
          <div className="card">
            <div className="row wrap">
              <Field label="View name"><input value={view.name} onChange={(e) => edit((v) => { v.name = e.target.value; })} /></Field>
              <Field label="Audience">
                <select value={view.audience} onChange={(e) => edit((v) => { v.audience = e.target.value; })}>
                  {Object.entries(VIEW_AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Dates visible">
              <div className="row wrap">
                <select value={view.dateMode} onChange={(e) => edit((v) => { v.dateMode = e.target.value; })}>
                  <option value="day">Current day only</option>
                  <option value="week">Current week only</option>
                  <option value="range">Custom range around today</option>
                </select>
                {view.dateMode === 'range' && (
                  <>
                    <input type="number" className="mini" min="0" value={view.pastDays} onChange={(e) => edit((v) => { v.pastDays = Number(e.target.value); })} /> days back
                    <input type="number" className="mini" min="0" value={view.futureDays} onChange={(e) => edit((v) => { v.futureDays = Number(e.target.value); })} /> days ahead
                  </>
                )}
              </div>
            </Field>
            <Field label="Classes">
              <div className="chips">
                {myClasses.map((c) => (
                  <Chip key={c.id} color={c.color} active={view.classIds.includes(c.id)} onClick={() => edit((v) => { v.classIds = v.classIds.includes(c.id) ? v.classIds.filter((x) => x !== c.id) : [...v.classIds, c.id]; })}>{c.name}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Lesson sections">
              <div className="chips">
                <Chip active={!view.sectionNames} onClick={() => edit((v) => { v.sectionNames = v.sectionNames ? null : [...sectionNames]; })}>All sections</Chip>
                {view.sectionNames && sectionNames.map((n) => (
                  <Chip key={n} active={view.sectionNames.includes(n)} onClick={() => edit((v) => { v.sectionNames = v.sectionNames.includes(n) ? v.sectionNames.filter((x) => x !== n) : [...v.sectionNames, n]; })}>{n}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Only show lessons with status" hint="Leave empty to show every lesson.">
              <div className="chips">
                {state.statuses.map((s) => (
                  <Chip key={s.id} color={s.color} active={view.statusIds.includes(s.id)} onClick={() => edit((v) => { v.statusIds = v.statusIds.includes(s.id) ? v.statusIds.filter((x) => x !== s.id) : [...v.statusIds, s.id]; })}>{s.name}</Chip>
                ))}
              </div>
            </Field>
            <div className="row wrap">
              {[['showAttachments', 'Attachments'], ['showStandards', 'Standards'], ['showSubNotes', 'Substitute notes'], ['allowSubNotes', 'Viewer can leave notes for me']].map(([k, l]) => (
                <label key={k} className="row small"><input type="checkbox" checked={!!view[k]} onChange={(e) => edit((v) => { v[k] = e.target.checked; })} /> {l}</label>
              ))}
            </div>
            <div className="row wrap">
              <a className="btn primary" href={`#/view/${view.id}`} target="_blank" rel="noreferrer">Open view</a>
              <SnapshotButton view={view} />
              <button className="danger" onClick={() => { update((d) => { d.views = d.views.filter((v) => v.id !== view.id); }); setSelected(null); notify('View deleted'); }}>Delete</button>
            </div>
            <p className="small muted">“Open view” shows the read-only page in this browser (e.g. on a classroom display or sub laptop). “Download page” saves a self-contained HTML file you can email, post to your LMS, or upload to Google Drive.</p>
          </div>
          <h3>Preview</h3>
          <div className="card"><ViewContent view={view} /></div>
        </section>
      ) : <section className="detail"><Empty>Create a view to share your plans.</Empty></section>}
    </div>
  );
}

export function viewDates(view, anchor = today(), calendar) {
  if (view.dateMode === 'day') {
    // Show the next school day when today has no classes (weekend, holiday).
    const next = calendar?.days.find((d) => d.date >= anchor);
    return [next ? next.date : anchor];
  }
  if (view.dateMode === 'week') {
    const mon = startOfWeek(planningAnchor(anchor));
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }
  const out = [];
  for (let i = -view.pastDays; i <= view.futureDays; i += 1) out.push(addDays(anchor, i));
  return out;
}

export function ViewContent({ view, anchor, interactive }) {
  const { state, calendar, classes, update } = useStore();
  const owner = state.users.find((u) => u.id === view.ownerId);
  const allowed = new Set(view.classIds);
  const dates = viewDates(view, anchor, calendar).filter((d) => calendar.byDate[d]);
  const days = dates.map((date) => {
    const day = calendar.byDate[date];
    const items = day.meetings.filter((m) => allowed.has(m.classId)).map((m) => {
      const cls = classes.find((c) => c.id === m.classId);
      const lesson = state.lessons[cls.sequence[m.index]];
      const statusOk = !view.statusIds.length || (lesson && lesson.statusIds.some((s) => view.statusIds.includes(s)));
      return { m, cls, lesson: statusOk ? lesson : null };
    });
    return { date, day, items };
  });
  return (
    <div className="view-content">
      <header className="view-head">
        <h2>{view.name}</h2>
        <div className="muted small">{owner?.name} · {VIEW_AUDIENCES[view.audience]}</div>
      </header>
      {days.length === 0 && <Empty>No school days in this range.</Empty>}
      {days.map(({ date, day, items }) => (
        <section key={date} className="view-day">
          <h3>{formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}{day.dayType && <span className="badge">{day.dayType.name}</span>}</h3>
          {items.length === 0 && <p className="muted small">No classes.</p>}
          {items.map(({ m, cls, lesson }) => (
            <article key={`${cls.id}-${m.start}`} className="view-lesson" style={{ '--c': cls.color, fontFamily: cls.font }}>
              <div className="row">
                <strong>{cls.name}</strong>
                <span className="muted small">{formatTime(m.start)}–{formatTime(m.end)}{cls.room ? ` · Room ${cls.room}` : ''}</span>
                {view.audience !== 'student' && lesson && <StatusChips ids={lesson.statusIds} />}
              </div>
              {lesson ? (
                <>
                  {lesson.title && <div className="meeting-title">{lesson.title}</div>}
                  <LessonContent lesson={lesson} cls={cls} opts={{ sectionNames: view.sectionNames, showAttachments: view.showAttachments, showStandards: view.showStandards }} />
                  {view.audience === 'substitute' && (lesson.accommodations?.length > 0 || lesson.differentiation?.length > 0) && (
                    <div className="small"><strong>Accommodations:</strong> {lesson.accommodations.join(', ') || '—'} · <strong>Differentiation:</strong> {lesson.differentiation.join(', ') || '—'}</div>
                  )}
                </>
              ) : <p className="muted small">No lesson posted.</p>}
              {view.showSubNotes && state.subNotes?.[date]?.[cls.id] && <div className="sub-note"><strong>Notes for the substitute:</strong> {state.subNotes[date][cls.id]}</div>}
              {view.audience === 'substitute' && view.showSubNotes && cls.students.some((s) => s.notes) && (
                <details className="small"><summary>Student notes ({cls.students.filter((s) => s.notes).length})</summary>
                  <ul>{cls.students.filter((s) => s.notes).map((s) => <li key={s.id}>{s.first} {s.last}: {s.notes}</li>)}</ul>
                </details>
              )}
              {interactive && view.allowSubNotes && (
                <textarea
                  className="feedback"
                  placeholder="Leave a note for the teacher about this class…"
                  defaultValue={state.subFeedback?.[date]?.[cls.id] || ''}
                  onBlur={(e) => update((d) => { d.subFeedback = d.subFeedback || {}; d.subFeedback[date] = { ...(d.subFeedback[date] || {}), [cls.id]: e.target.value }; })}
                />
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function SnapshotButton({ view }) {
  const ctx = useStore();
  const go = () => {
    const html = renderToStaticMarkup(<StoreContext.Provider value={ctx}><ViewContent view={view} /></StoreContext.Provider>);
    const css = Array.from(document.styleSheets).flatMap((s) => { try { return Array.from(s.cssRules).map((r) => r.cssText); } catch { return []; } }).join('\n');
    const root = document.documentElement;
    const page = `<!doctype html><html${root.dataset.mode ? ` data-mode="${root.dataset.mode}"` : ''} style="${root.style.cssText}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${view.name}</title><style>${css}</style></head><body class="snapshot"><main class="viewer">${html}<p class="small muted">Snapshot generated ${new Date().toLocaleString()}</p></main></body></html>`;
    download(`${view.name.replace(/[^\w-]+/g, '-')}-${today()}.html`, page, 'text/html');
  };
  return <button onClick={go}>Download page</button>;
}

/** Standalone page at #/view/<id> */
export function Viewer({ id }) {
  const { state, calendar } = useStore();
  const view = state.views.find((v) => v.id === id);
  const [anchor, setAnchor] = useState(today());
  if (!view) return <main className="viewer"><Empty>This view no longer exists.</Empty></main>;
  const shown = view.dateMode === 'day' ? viewDates(view, anchor, calendar)[0] : anchor;
  const step = view.dateMode === 'day' ? 1 : 7;
  const canNavigate = view.dateMode === 'range' ? false : view.audience !== 'student' && view.audience !== 'parent';
  return (
    <main className="viewer">
      {canNavigate && (
        <div className="row no-print">
          <button onClick={() => setAnchor(view.dateMode === 'day' ? (calendar.days.filter((d) => d.date < shown).at(-1)?.date || anchor) : addDays(anchor, -step))}>‹ Previous</button>
          <button onClick={() => setAnchor(today())}>Today</button>
          <button onClick={() => setAnchor(addDays(shown, step))}>Next ›</button>
        </div>
      )}
      <ViewContent view={view} anchor={anchor} interactive />
    </main>
  );
}
