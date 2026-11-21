import { Fragment, useEffect, useMemo, useState } from 'react';
import { navigate, useHashRoute } from '../lib/router.js';
import { useStore } from '../lib/store.jsx';
import { canEdit, canView, uid } from '../lib/model.js';
import { bump, clearAt, extend, insertAt, move, placeOrInsert, pullBack, swap } from '../lib/sequence.js';
import { copyLesson, editSequence, pruneOrphans } from '../lib/actions.js';
import { addDays, formatDate, formatTime, planningAnchor, startOfWeek, today, DOW_LONG } from '../lib/dates.js';
import { dayKeyLabel, isNonSchoolDay, meetingIndexOnOrAfter, weekDates, weekStartDay } from '../lib/schedule.js';
import { paintDates } from '../lib/calendarPaint.js';
import { schoolReadOnly } from '../lib/cloud/schoolSync.js';
import LessonEditor from '../components/LessonEditor.jsx';
import { YearProgress } from '../components/YearProgress.jsx';
import { LessonContent, StatusChips } from '../components/LessonContent.jsx';
import { Field, Menu, Modal, Tabs, Empty } from '../components/ui.jsx';

export default function Planner() {
  const { state, year, classes, calendar, userId } = useStore();
  const [anchor, setAnchor] = useState(() => {
    const t = planningAnchor();
    return t < year.start ? year.start : t > year.end ? year.end : t;
  });
  // Phones start on one day at a time; a week of columns is too cramped there.
  const [mode, setMode] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 599px)').matches ? 'day' : 'week'));
  const [hidden, setHidden] = useState([]);
  const [editing, setEditing] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(true);
  const [focusClass, setFocusClass] = useState(null);
  const [, rDate, rClass, rIndex] = useHashRoute();

  // Deep links (e.g. from search): jump to the date and open the lesson.
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rDate || '')) return;
    setAnchor(rDate);
    if (mode === 'class') setMode('week');
    if (rClass && rIndex != null && calendar.byClass[rClass]) {
      const meeting = calendar.byClass[rClass][Number(rIndex)];
      setEditing({ containerId: rClass, index: Number(rIndex), date: meeting?.date || rDate, meeting });
    }
  }, [rDate, rClass, rIndex]);
  const closeEditor = () => {
    setEditing(null);
    if (rClass) window.location.replace(`#/planner/${rDate}`);
  };

  const visible = classes.filter((c) => canView(c, userId));
  const shown = visible.filter((c) => !hidden.includes(c.id));
  const shownIds = new Set(shown.map((c) => c.id));
  const dates = mode === 'day' ? [anchor] : weekDates(anchor, year.weekdays).filter((d) => (year.weekdays || [1, 2, 3, 4, 5]).includes(new Date(d + 'T00:00').getDay()));
  const step = mode === 'day' ? 1 : 7;

  return (
    <div className="page planner">
      <div className="toolbar no-print">
        <Tabs tabs={[['week', 'Week'], ['day', 'Day'], ['class', 'Class list']]} value={mode} onChange={setMode} />
        <div className="row">
          <button onClick={() => setAnchor(addDays(anchor, -step))} aria-label="Previous">‹</button>
          <button onClick={() => setAnchor(planningAnchor())}>Today</button>
          <button onClick={() => setAnchor(addDays(anchor, step))} aria-label="Next">›</button>
          <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
        </div>
        <div className="row wrap">
          {visible.map((c) => (
            <label key={c.id} className="class-toggle" style={{ '--c': c.color }}>
              <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => setHidden((h) => (h.includes(c.id) ? h.filter((x) => x !== c.id) : [...h, c.id]))} />
              {c.name}
            </label>
          ))}
        </div>
        <label className="row small"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> Details</label>
        <YearProgress />
        <Menu
          className="print-menu"
          title="Print / PDF"
          label="Print / PDF ▾"
          items={[
            { label: 'Weekly lesson plans (PDF)…', onClick: () => navigate(`print/week/${anchor}`) },
            { label: `Sub plans for ${formatDate(firstSchoolDay(calendar, anchor), { weekday: 'short', month: 'short', day: 'numeric' })} (PDF)…`, onClick: () => navigate(`print/sub/${firstSchoolDay(calendar, anchor)}`) },
            '-',
            { label: 'Print this screen', onClick: () => window.print() },
          ]}
        />
      </div>

      {visible.length === 0 && (
        <section className="getting-started">
          <h2>Set up your plan book</h2>
          <ol>
            <li><a href="#/setup">Schedule</a>: your school year’s first and last day, breaks and days off. You can import your district calendar.</li>
            <li><a href="#/classes">Classes</a>: each class you teach and when it meets.</li>
            <li>Come back here and plan lessons. Each class gets a row in your week.</li>
          </ol>
          <p className="small muted">Want to look around first? <a href="#/settings/data">Load sample data</a> in Settings, then use <strong>Start fresh</strong> there when you’re ready.</p>
        </section>
      )}

      {mode === 'class' ? (
        <ClassList
          classes={visible}
          classId={focusClass || visible[0]?.id}
          setClassId={setFocusClass}
          from={startOfWeek(anchor, weekStartDay(year.weekdays))}
          onOpen={setEditing}
          onDialog={setDialog}
        />
      ) : mode === 'week' ? (
        <PlanBookWeek dates={dates} classes={shown} detail={detail} onOpen={setEditing} onDialog={setDialog} />
      ) : (
        <div className="week-grid" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(320px, 1fr))` }}>
          {dates.map((date) => (
            <DayColumn
              key={date}
              date={date}
              day={calendar.byDate[date]}
              year={year}
              shownIds={shownIds}
              detail={detail}
              onOpen={setEditing}
              onDialog={setDialog}
            />
          ))}
        </div>
      )}

      {editing && <LessonEditor {...editing} onClose={closeEditor} />}
      {dialog?.kind === 'target' && <TargetDialog {...dialog} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'extra' && <ExtraClassDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** The first school day on or after `date` (or `date` itself if none). */
function firstSchoolDay(calendar, date) {
  return calendar.days.find((d) => d.date >= date)?.date || date;
}

// The lesson being dragged. HTML drag events don't expose their data until the
// drop, so the source lives here while a drag is in progress.
let dragSource = null;

/** A day's heading: date, rotation day or day off, alternate schedule, and the day menu. */
function DayHead({ date, day, onDialog, className = 'day-head' }) {
  const { year } = useStore();
  const off = isNonSchoolDay(year, date);
  const outside = date < year.start || date > year.end;
  const removed = (year.overrides || []).filter((o) => o.date === date && o.type === 'remove');
  return (
    <header className={className}>
      <div>
        <div className="day-name"><span className="mark-on">{formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
        <div className="small muted">
          {/* On a weekly schedule the day label would just repeat the weekday. */}
          {day ? (year.scheduleType === 'weekly' ? '' : dayKeyLabel(day.dayKey, year)) : outside ? 'Outside school year' : off ? off.label : 'No school'}
          {day?.dayType && <span className="badge">{day.dayType.name}</span>}
        </div>
      </div>
      {day && <DayMenu date={date} day={day} removed={removed} onDialog={onDialog} />}
    </header>
  );
}

function DayColumn({ date, day, shownIds, detail, onOpen, onDialog }) {
  const { year } = useStore();
  const off = isNonSchoolDay(year, date);
  return (
    <section className={`day-col ${date === today() ? 'is-today' : ''}`}>
      <DayHead date={date} day={day} onDialog={onDialog} />
      {day && day.meetings.filter((m) => shownIds.has(m.classId)).map((m) => (
        <MeetingCard key={`${m.classId}-${m.start}-${m.overrideId || ''}`} m={m} date={date} detail={detail} onOpen={onOpen} onDialog={onDialog} />
      ))}
      {day && day.meetings.length === 0 && <div className="muted small pad">No classes scheduled.</div>}
      {!day && off && <div className="off-day">{off.label}</div>}
    </section>
  );
}

/** The usual meeting time and room for a class's row heading. */
function usualTime(cls) {
  const counts = new Map();
  for (const s of cls.slots || []) {
    if (!s.start) continue;
    const key = `${s.start}|${s.end}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best) return '';
  const [start, end] = best.split('|');
  return `${formatTime(start)}–${formatTime(end)}${counts.size > 1 ? ' (varies)' : ''}`;
}

/**
 * The week as a paper plan book: one row per class, one column per day.
 * Days off are hatched; the red margin rule separates classes from days.
 */
function PlanBookWeek({ dates, classes, detail, onOpen, onDialog }) {
  const { calendar } = useStore();
  const now = today();
  if (!classes.length) return null;
  return (
    <div className="planbook-scroll">
      <div className="planbook" style={{ gridTemplateColumns: `minmax(8.5rem, 10rem) repeat(${dates.length}, minmax(11rem, 1fr))` }}>
        <div className="pb-corner" aria-hidden="true" />
        {dates.map((date) => (
          <DayHead key={date} date={date} day={calendar.byDate[date]} onDialog={onDialog} className={`pb-day ${date === now ? 'is-today' : ''}`} />
        ))}
        {classes.map((cls) => (
          <Fragment key={cls.id}>
            <div className="pb-class" style={{ '--c': cls.color }}>
              <div className="pb-class-name">{cls.name}</div>
              <div className="pb-meta">{usualTime(cls)}</div>
              {cls.room && <div className="pb-meta">{cls.room}</div>}
            </div>
            {dates.map((date) => {
              const day = calendar.byDate[date];
              const meetings = day ? day.meetings.filter((m) => m.classId === cls.id) : [];
              return (
                <div key={date} className={`pb-cell ${date === now ? 'is-today' : ''} ${day ? '' : 'pb-off'}`}>
                  {meetings.map((m) => (
                    <MeetingCard key={`${m.start}-${m.overrideId || ''}`} m={m} date={date} detail={detail} onOpen={onOpen} onDialog={onDialog} inRow />
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function DayMenu({ date, day, removed, onDialog }) {
  const { update, notify, year, classes } = useStore();
  const readOnly = schoolReadOnly(year);
  const setDayType = (id) => update((d) => {
    const y = d.years.find((x) => x.id === year.id);
    if (id) y.dayAssignments[date] = id; else delete y.dayAssignments[date];
  });
  return (
    <Menu
      title="Day options"
      items={[
        { label: 'Sub plans for this day (PDF)…', onClick: () => navigate(`print/sub/${date}`) },
        { label: '+ Add extra class', onClick: () => onDialog({ kind: 'extra', date }) },
        // Days off and school schedules come from the school for its members.
        !readOnly && {
          label: 'Cancel this day (snow day…)',
          onClick: () => {
            update((d) => paintDates(d.years.find((x) => x.id === year.id), [date], { kind: 'cancelled', label: 'Cancelled' }), { separate: true });
            notify('Day cancelled. Its lessons moved to the next class meetings.', { undo: true });
          },
        },
        '-',
        ...((year.dayTypes || []).filter((t) => !(readOnly && t.school)).map((t) => ({ label: `${day.dayType?.id === t.id ? '✓ ' : ''}Make “${t.name}”`, onClick: () => setDayType(t.id) }))),
        day.dayType && !(readOnly && day.dayType.school) && { label: 'Restore regular schedule', onClick: () => setDayType(null) },
        (year.dayTypes || []).length === 0 && { label: 'Create alternate days in Schedule…', onClick: () => { window.location.hash = '#/setup'; } },
        removed.length > 0 && '-',
        ...removed.map((o) => ({
          label: `Restore ${classes.find((c) => c.id === o.classId)?.name}`,
          onClick: () => { update((d) => { const y = d.years.find((x) => x.id === year.id); y.overrides = y.overrides.filter((x) => x.id !== o.id); }); notify('Class restored', { undo: true }); },
        })),
      ]}
    />
  );
}

function MeetingCard({ m, date, detail, onOpen, onDialog, inRow = false }) {
  const { state, update, notify, year, classes, userId } = useStore();
  const cls = classes.find((c) => c.id === m.classId);
  const lessonId = cls.sequence[m.index];
  const lesson = lessonId ? state.lessons[lessonId] : null;
  const editable = canEdit(cls, userId);
  const linked = lesson && lesson.homeId !== cls.id;
  const seqOp = (fn, msg) => { update((d) => { editSequence(d, cls.id, fn); pruneOrphans(d); }); notify(msg, { undo: true }); };
  const removeFromDay = () => {
    update((d) => {
      const y = d.years.find((x) => x.id === year.id);
      if (m.extra) y.overrides = y.overrides.filter((o) => o.id !== m.overrideId);
      else y.overrides.push({ id: uid('ov'), date, classId: cls.id, type: 'remove' });
    });
    notify(m.extra ? 'Extra class removed' : `${cls.name} removed from this day`, { undo: true });
  };

  // ---- drag and drop: same class = move, another class = copy
  const [dropMode, setDropMode] = useState(null);
  const modeFor = () => {
    if (!dragSource || !editable) return null;
    if (dragSource.classId !== cls.id) return 'copy';
    return dragSource.index === m.index ? null : 'move';
  };
  const dragProps = editable && lesson ? {
    draggable: true,
    onDragStart: (e) => {
      dragSource = { classId: cls.id, index: m.index, lessonId, title: lesson.title };
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', lesson.title || 'Lesson');
    },
    onDragEnd: () => { dragSource = null; },
  } : {};
  const dropProps = {
    onDragOver: (e) => {
      const mode = modeFor();
      if (!mode) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = mode;
      if (dropMode !== mode) setDropMode(mode);
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropMode(null); },
    onDrop: (e) => {
      const mode = modeFor();
      const src = dragSource;
      dragSource = null;
      setDropMode(null);
      if (!mode) return;
      e.preventDefault();
      const when = formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
      if (mode === 'move') {
        update((d) => editSequence(d, cls.id, (s) => move(s, src.index, m.index)));
        notify(`Moved “${src.title || 'lesson'}” to ${when}`, { undo: true });
      } else {
        update((d) => {
          const id = copyLesson(d, src.lessonId, cls.id, userId);
          editSequence(d, cls.id, (s) => placeOrInsert(s, m.index, id));
        });
        notify(`Copied “${src.title || 'lesson'}” to ${cls.name} on ${when}`, { undo: true });
      }
    },
  };
  const prevExtended = lesson && cls.sequence[m.index - 1] === lessonId;
  const note = state.subNotes?.[date]?.[cls.id];

  return (
    <article
      {...dragProps}
      {...dropProps}
      title={dragProps.draggable ? 'Click to edit · drag to move (or onto another class to copy)' : undefined}
      className={`meeting ${inRow ? 'meeting-in-row' : ''} ${lesson ? '' : 'meeting-empty'} ${dropMode ? 'drop-over' : ''}`}
      style={{ '--c': cls.color, fontFamily: cls.font, fontSize: cls.fontSize }}
      onClick={() => onOpen({ containerId: cls.id, index: m.index, date, meeting: m })}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen({ containerId: cls.id, index: m.index, date, meeting: m })}
    >
      <div className="meeting-head">
        <div>
          {/* In the plan book the row already names the class. */}
          {!inRow && <div className="meeting-class">{cls.name}{m.extra && <span className="badge">Extra</span>}</div>}
          <div className="meeting-time">{formatTime(m.start)}–{formatTime(m.end)}{!inRow && cls.room ? ` · ${cls.room}` : ''}{inRow && m.extra && <span className="badge">Extra</span>}</div>
        </div>
        {editable && (
          <Menu
            items={[
              { label: 'Bump forward one day', onClick: () => seqOp((s) => bump(s, m.index), 'Lessons bumped forward') },
              lesson && { label: 'Extend to next day', onClick: () => seqOp((s) => extend(s, m.index), 'Lesson extended') },
              lesson && { label: 'Move to another date…', onClick: () => onDialog({ kind: 'target', action: 'move', cls, index: m.index, lessonId }) },
              lesson && { label: 'Copy to…', onClick: () => onDialog({ kind: 'target', action: 'copy', cls, index: m.index, lessonId }) },
              lesson && { label: 'Link into another class…', onClick: () => onDialog({ kind: 'target', action: 'link', cls, index: m.index, lessonId }) },
              '-',
              lesson && { label: 'Clear (leave day empty)', onClick: () => seqOp((s) => clearAt(s, m.index), 'Lesson cleared') },
              { label: 'Delete day & pull lessons back', danger: true, onClick: () => seqOp((s) => pullBack(s, m.index), 'Lessons pulled back') },
              '-',
              { label: m.extra ? 'Remove extra class' : 'Remove class from this day', danger: true, onClick: removeFromDay },
            ]}
          />
        )}
      </div>
      {lesson ? (
        <>
          <div className="meeting-title">
            {lesson.title || <span className="muted">Untitled lesson</span>}
            {prevExtended && <span className="badge">cont.</span>}
            {linked && <span className="badge" title="Linked shared content">🔗</span>}
          </div>
          <div className="chips"><StatusChips ids={lesson.statusIds} /></div>
          {detail && <LessonContent lesson={lesson} cls={cls} opts={{ compact: true, showAttachments: true, privateNote: lesson.privateNotes?.[userId] }} />}
        </>
      ) : (
        <div className="muted small">{editable ? '+ Add lesson' : 'No lesson'}</div>
      )}
      {detail && note && <div className="sub-note small">Sub plan: {note}</div>}
      {state.subFeedback?.[date]?.[cls.id] && <div className="sub-note feedback-note small">From the sub: {state.subFeedback[date][cls.id]}</div>}
      {dropMode && <div className="drop-hint">{dropMode === 'move' ? 'Move here' : `Copy to ${cls.name}`}</div>}
    </article>
  );
}

function TargetDialog({ action, cls, index, lessonId, onClose }) {
  const { state, update, notify, classes, calendar, userId } = useStore();
  const editable = classes.filter((c) => canEdit(c, userId));
  const [targetId, setTargetId] = useState(action === 'move' ? cls.id : editable.find((c) => c.id !== cls.id)?.id || cls.id);
  const [date, setDate] = useState(calendar.byClass[cls.id]?.[index]?.date || today());
  const lesson = state.lessons[lessonId];
  const targetMeeting = (calendar.byClass[targetId] || []).find((m) => m.date >= date);
  const labels = { move: 'Move lesson', copy: 'Copy lesson', link: 'Link lesson' };

  const apply = () => {
    const to = meetingIndexOnOrAfter(calendar, targetId, date);
    update((d) => {
      if (action === 'move') editSequence(d, cls.id, (s) => move(s, index, to));
      else if (action === 'copy') {
        const newId = copyLesson(d, lessonId, targetId, userId);
        editSequence(d, targetId, (s) => insertAt(s, to, newId));
      } else editSequence(d, targetId, (s) => insertAt(s, to, lessonId));
    });
    notify(`${labels[action]}: done`, { undo: true });
    onClose();
  };

  return (
    <Modal title={`${labels[action]} “${lesson?.title || 'Untitled'}”`} onClose={onClose}
      footer={<><span className="grow" /><button onClick={onClose}>Cancel</button><button className="primary" onClick={apply} disabled={!targetMeeting}>{labels[action]}</button></>}>
      {action !== 'move' && (
        <Field label="Target class">
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {editable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Date" hint="Placed on the class's first meeting on or after this date; lessons already there are bumped forward.">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="small">
        {targetMeeting ? <>Lands on <strong>{formatDate(targetMeeting.date, { weekday: 'long', month: 'short', day: 'numeric' })}</strong> at {formatTime(targetMeeting.start)}.</> : 'No meeting for that class on or after this date.'}
        {action === 'link' && ' Linked lessons stay in sync — edits show up in both classes.'}
        {action === 'move' && ' The original day is left empty.'}
      </p>
    </Modal>
  );
}

function ExtraClassDialog({ date, onClose }) {
  const { update, year, classes, userId, notify } = useStore();
  const editable = classes.filter((c) => canEdit(c, userId));
  const [classId, setClassId] = useState(editable[0]?.id);
  const [start, setStart] = useState('14:00');
  const [end, setEnd] = useState('14:45');
  const add = () => {
    update((d) => d.years.find((y) => y.id === year.id).overrides.push({ id: uid('ov'), date, classId, type: 'add', start, end }));
    notify('Extra class added — later lessons shift to fill it', { undo: true });
    onClose();
  };
  return (
    <Modal title={`Add extra class — ${DOW_LONG[new Date(date + 'T00:00').getDay()]} ${formatDate(date, { month: 'short', day: 'numeric' })}`} onClose={onClose}
      footer={<><span className="grow" /><button onClick={onClose}>Cancel</button><button className="primary" onClick={add} disabled={!classId}>Add</button></>}>
      <Field label="Class">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {editable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="row">
        <Field label="Start"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ClassList({ classes, classId, setClassId, from, onOpen }) {
  const { state, calendar, update, userId } = useStore();
  const cls = classes.find((c) => c.id === classId);
  const [count, setCount] = useState(20);
  const meetings = useMemo(() => (calendar.byClass[classId] || []).filter((m) => m.date >= from).slice(0, count), [calendar, classId, from, count]);
  if (!cls) return null;
  const total = (calendar.byClass[classId] || []).length;
  const overflow = cls.sequence.slice(total).filter(Boolean);
  const editable = canEdit(cls, userId);
  return (
    <div className="class-list">
      <div className="row">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="muted small">{total} meetings this year · {cls.sequence.filter(Boolean).length} lessons planned</span>
      </div>
      <table className="table">
        <thead><tr><th>#</th><th>Date</th><th>Lesson</th><th>Status</th><th /></tr></thead>
        <tbody>
          {meetings.map((m) => {
            const lesson = state.lessons[cls.sequence[m.index]];
            return (
              <tr key={m.index} onClick={() => onOpen({ containerId: cls.id, index: m.index, date: m.date, meeting: m })} className="clickable">
                <td className="muted">{m.index + 1}</td>
                <td>{formatDate(m.date)}</td>
                <td>{lesson?.title || <span className="muted">—</span>}</td>
                <td><StatusChips ids={lesson?.statusIds} /></td>
                <td onClick={(e) => e.stopPropagation()} className="nowrap">
                  {editable && (
                    <>
                      <button className="icon-btn" title="Move up" disabled={m.index === 0} onClick={() => update((d) => editSequence(d, cls.id, (s) => swap(s, m.index, m.index - 1)))}>↑</button>
                      <button className="icon-btn" title="Move down" onClick={() => update((d) => editSequence(d, cls.id, (s) => swap(s, m.index, m.index + 1)))}>↓</button>
                      <button className="icon-btn" title="Bump" onClick={() => update((d) => editSequence(d, cls.id, (s) => bump(s, m.index)))}>⇥</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {meetings.length === count && <button onClick={() => setCount(count + 20)}>Show more</button>}
      {overflow.length > 0 && (
        <div className="notice">{overflow.length} lesson(s) are past the last meeting of the year — pull lessons back or add class days to fit them.</div>
      )}
    </div>
  );
}
