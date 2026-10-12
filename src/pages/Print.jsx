import { useState } from 'react';
import { host, useStore } from '../lib/store.jsx';
import { navigate, useHashRoute } from '../lib/router.js';
import { canView, currentUser, standardIndex } from '../lib/model.js';
import { formatDate, formatTime, planningAnchor } from '../lib/dates.js';
import { weekDates } from '../lib/schedule.js';
import { LessonContent } from '../components/LessonContent.jsx';

const long = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };

/** #/print/week/<date> and #/print/sub/<date> — printable documents, also saved as PDF. */
export default function PrintPage() {
  const [, kind, rawDate] = useHashRoute();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || '') ? rawDate : planningAnchor();
  const { notify } = useStore();
  const [opts, setOpts] = useState({ layout: 'day', details: true, standards: true, supports: true, attachments: true, pageBreaks: false });
  const set = (k) => (e) => setOpts({ ...opts, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isSub = kind === 'sub';
  const fileName = isSub ? `Sub Plans - ${date}.pdf` : `Lesson Plans - Week of ${weekDates(date)[0]}.pdf`;

  const savePdf = async () => {
    if (!host?.savePdf) { window.print(); return; }
    try {
      const saved = await host.savePdf(fileName);
      if (saved) notify(`Saved ${saved.split(/[\\/]/).pop()}`, { action: { label: 'Open', run: () => host.openLastPdf() } });
    } catch {
      notify('Could not save the PDF.', true);
    }
  };

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <button onClick={() => navigate(`planner/${date}`)}>← Back to planner</button>
        <strong className="grow">{isSub ? 'Substitute plans' : 'Weekly lesson plans'}</strong>
        {!isSub && (
          <>
            <label className="row small">Arrange
              <select value={opts.layout} onChange={set('layout')}>
                <option value="day">by day</option>
                <option value="class">by class</option>
              </select>
            </label>
            <label className="row small"><input type="checkbox" checked={opts.details} onChange={set('details')} /> Lesson details</label>
            <label className="row small"><input type="checkbox" checked={opts.pageBreaks} onChange={set('pageBreaks')} /> New page for each {opts.layout}</label>
          </>
        )}
        <label className="row small"><input type="checkbox" checked={opts.standards} onChange={set('standards')} /> Standards</label>
        <label className="row small"><input type="checkbox" checked={opts.supports} onChange={set('supports')} /> Strategies &amp; supports</label>
        <button onClick={() => window.print()}>Print…</button>
        <button className="primary" onClick={savePdf}>{host?.savePdf ? 'Save as PDF…' : 'Save as PDF / Print…'}</button>
      </div>
      {!host?.savePdf && <p className="no-print small muted print-tip">To save a PDF, choose “Save as PDF” as the printer.</p>}
      <article className="print-doc">
        {isSub ? <SubPacket date={date} opts={opts} /> : <WeekPlans date={date} opts={opts} />}
      </article>
    </div>
  );
}

function LessonBlock({ cls, meeting, lesson, opts, std }) {
  return (
    <section className="print-lesson">
      <h3>
        <span className="print-swatch" style={{ background: cls.color }} />
        {cls.name}
        <span className="print-meta">{formatTime(meeting.start)}–{formatTime(meeting.end)}{cls.room ? ` · Room ${cls.room}` : ''}{meeting.extra ? ' · extra class' : ''}</span>
      </h3>
      {lesson ? (
        <>
          <div className="print-title">{lesson.title || 'Untitled lesson'}</div>
          {opts.details !== false && <LessonContent lesson={lesson} cls={cls} opts={{ showAttachments: opts.attachments !== false }} />}
          {opts.standards && lesson.standardIds?.length > 0 && (
            <p className="print-line"><strong>Standards:</strong> {lesson.standardIds.map((id) => std[id]?.code || id).join(', ')}</p>
          )}
          {opts.supports && (
            <>
              {lesson.strategies?.length > 0 && <p className="print-line"><strong>Strategies:</strong> {lesson.strategies.join(', ')}</p>}
              {lesson.differentiation?.length > 0 && <p className="print-line"><strong>Differentiation:</strong> {lesson.differentiation.join(', ')}</p>}
              {lesson.accommodations?.length > 0 && <p className="print-line"><strong>Accommodations:</strong> {lesson.accommodations.join(', ')}</p>}
            </>
          )}
        </>
      ) : <p className="muted">No lesson planned.</p>}
    </section>
  );
}

function WeekPlans({ date, opts }) {
  const { state, year, classes, calendar, userId } = useStore();
  const me = currentUser(state);
  const std = standardIndex(state);
  const visible = classes.filter((c) => canView(c, userId));
  const days = weekDates(date).map((d) => calendar.byDate[d]).filter(Boolean);
  const lessonFor = (m) => state.lessons[visible.find((c) => c.id === m.classId)?.sequence[m.index]];
  const breakCls = opts.pageBreaks ? 'print-break' : '';

  return (
    <>
      <header className="print-head">
        <h1>Lesson Plans</h1>
        <p>Week of {formatDate(weekDates(date)[0], long)}</p>
        <p className="muted">{me?.name}{me?.email ? ` · ${me.email}` : ''} · {year.name}</p>
      </header>
      {days.length === 0 && <p>No school days this week.</p>}
      {opts.layout === 'day'
        ? days.map((day, i) => (
          <section key={day.date} className={`print-group ${i ? breakCls : ''}`}>
            {day.meetings.filter((m) => visible.some((c) => c.id === m.classId)).map((m, j) => {
              const block = <LessonBlock cls={visible.find((c) => c.id === m.classId)} meeting={m} lesson={lessonFor(m)} opts={opts} std={std} />;
              // Keep the day heading on the same page as its first lesson.
              return j === 0
                ? <div key={`${m.classId}-${m.start}`} className="print-keep"><h2>{formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}{day.dayType ? ` — ${day.dayType.name}` : ''}</h2>{block}</div>
                : <div key={`${m.classId}-${m.start}`}>{block}</div>;
            })}
            {day.meetings.length === 0 && <><h2>{formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2><p className="muted">No classes.</p></>}
          </section>
        ))
        : visible.map((cls, i) => (
          <section key={cls.id} className={`print-group ${i ? breakCls : ''}`}>
            <h2 className="print-heading">{cls.name}</h2>
            {days.flatMap((day) => day.meetings.filter((m) => m.classId === cls.id).map((m) => (
              <div key={`${day.date}-${m.start}`} className="print-keep">
                <h4 className="print-day">{formatDate(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}</h4>
                <LessonBlock cls={cls} meeting={m} lesson={lessonFor(m)} opts={opts} std={std} />
              </div>
            )))}
          </section>
        ))}
    </>
  );
}

function SubPacket({ date, opts }) {
  const { state, update, year, classes, calendar, userId } = useStore();
  const me = currentUser(state);
  const std = standardIndex(state);
  const day = calendar.byDate[date];
  const visible = classes.filter((c) => canView(c, userId));
  const meetings = (day?.meetings || []).filter((m) => visible.some((c) => c.id === m.classId));
  const notes = state.subNotes?.[date] || {};
  const setNote = (key, text) => update((d) => { d.subNotes[date] = { ...(d.subNotes[date] || {}), [key]: text }; });

  return (
    <>
      <header className="print-head">
        <h1>Substitute Plans</h1>
        <p>{formatDate(date, long)}{day?.dayType ? ` — ${day.dayType.name}` : ''}</p>
        <p className="muted">For {me?.name}’s classes{me?.email ? ` · ${me.email}` : ''} · {year.name}</p>
      </header>
      {!day && <p>There is no school on this day.</p>}
      {day && (
        <>
          <section className="print-group">
            <h2>Notes for the day</h2>
            <EditableNote value={notes._general} onChange={(t) => setNote('_general', t)} placeholder="Where to find materials, procedures, duty, who to ask for help…" />
            <h2>Schedule</h2>
            <table className="print-table">
              <thead><tr><th>Time</th><th>Class</th><th>Room</th><th>Lesson</th></tr></thead>
              <tbody>
                {meetings.map((m) => {
                  const cls = visible.find((c) => c.id === m.classId);
                  return (
                    <tr key={`${m.classId}-${m.start}`}>
                      <td className="nowrap">{formatTime(m.start)}–{formatTime(m.end)}</td>
                      <td>{cls.name}</td>
                      <td>{cls.room}</td>
                      <td>{state.lessons[cls.sequence[m.index]]?.title || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {meetings.length === 0 && <p className="muted">No classes meet on this day.</p>}
          </section>
          {meetings.map((m) => {
            const cls = visible.find((c) => c.id === m.classId);
            const lesson = state.lessons[cls.sequence[m.index]];
            const flagged = cls.students.filter((s) => s.notes);
            const chart = cls.seatingCharts?.[0];
            return (
              <section key={`${m.classId}-${m.start}`} className="print-group print-break">
                <LessonBlock cls={cls} meeting={m} lesson={lesson} opts={{ ...opts, details: true, attachments: true }} std={std} />
                <h4>Notes for the substitute</h4>
                <EditableNote value={notes[cls.id]} onChange={(t) => setNote(cls.id, t)} placeholder={`Anything specific to ${cls.name}…`} />
                {cls.students.length > 0 && (
                  <>
                    <h4>Class list ({cls.students.length})</h4>
                    <ul className="print-roster">
                      {[...cls.students].sort((a, b) => a.last.localeCompare(b.last)).map((s) => (
                        <li key={s.id}>{s.last}, {s.first}{s.notes ? ' *' : ''}</li>
                      ))}
                    </ul>
                    {flagged.length > 0 && (
                      <>
                        <p className="print-line"><strong>* Student notes</strong></p>
                        <ul className="print-notes">{flagged.map((s) => <li key={s.id}><strong>{s.first} {s.last}:</strong> {s.notes}</li>)}</ul>
                      </>
                    )}
                  </>
                )}
                {chart && Object.keys(chart.seats).length > 0 && (
                  <>
                    <h4>Seating chart — {chart.name}</h4>
                    <div className="print-front">Front of room</div>
                    <div className="print-seats" style={{ gridTemplateColumns: `repeat(${chart.cols}, 1fr)` }}>
                      {Array.from({ length: chart.rows * chart.cols }, (_, i) => {
                        const key = `${Math.floor(i / chart.cols)}-${i % chart.cols}`;
                        if (chart.disabled.includes(key)) return <div key={key} />;
                        const s = cls.students.find((x) => x.id === chart.seats[key]);
                        return <div key={key} className="print-seat">{s ? `${s.first} ${s.last[0] || ''}.` : ''}</div>;
                      })}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}

/** A note you can type into on screen; prints as plain text. */
function EditableNote({ value, onChange, placeholder }) {
  return (
    <>
      <textarea className="no-print print-note-input" rows={3} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="print-only print-note">{value || '—'}</div>
    </>
  );
}
