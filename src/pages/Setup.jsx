import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { makeYear, rolloverYear, uid, yearClasses } from '../lib/model.js';
import { SCHEDULE_TYPES, schoolDays } from '../lib/schedule.js';
import { DOW_SHORT, formatDate, shiftYear } from '../lib/dates.js';
import { Field, Modal, Empty } from '../components/ui.jsx';

export default function Setup() {
  const { state, update, year, notify } = useStore();
  const [rollover, setRollover] = useState(false);
  const setYear = (patch) => update((d) => Object.assign(d.years.find((y) => y.id === year.id), patch));
  const editYear = (fn) => update((d) => fn(d.years.find((y) => y.id === year.id)));
  const days = schoolDays(year);
  const classes = yearClasses(state, year.id);

  return (
    <div className="page">
      <div className="page-head">
        <h1>School Year & Schedule</h1>
        <div className="row">
          <select value={year.id} onChange={(e) => update((d) => { d.currentYearId = e.target.value; })}>
            {state.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <button onClick={() => { const y = makeYear({ name: 'New School Year' }); update((d) => { d.years.push(y); d.currentYearId = y.id; }); }}>New blank year</button>
          <button className="primary" onClick={() => setRollover(true)}>Re-use for next year…</button>
        </div>
      </div>

      <div className="cards">
        <section className="card">
          <h2>Calendar</h2>
          <Field label="Name"><input value={year.name} onChange={(e) => setYear({ name: e.target.value })} /></Field>
          <div className="row">
            <Field label="First day"><input type="date" value={year.start} onChange={(e) => setYear({ start: e.target.value })} /></Field>
            <Field label="Last day"><input type="date" value={year.end} onChange={(e) => setYear({ end: e.target.value })} /></Field>
          </div>
          <Field label="School days of the week">
            <div className="row wrap">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} className="row small">
                  <input type="checkbox" checked={year.weekdays.includes(d)} onChange={() => setYear({ weekdays: year.weekdays.includes(d) ? year.weekdays.filter((x) => x !== d) : [...year.weekdays, d] })} />
                  {DOW_SHORT[d]}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Schedule type">
            <select value={year.scheduleType} onChange={(e) => setYear({ scheduleType: e.target.value })}>
              {Object.entries(SCHEDULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {year.scheduleType === 'cycle' && (
            <div className="row">
              <Field label="Days in cycle"><input type="number" min="2" max="20" value={year.cycleLength} onChange={(e) => setYear({ cycleLength: Number(e.target.value) })} /></Field>
              <Field label="First day of year is"><select value={year.cycleStartDay} onChange={(e) => setYear({ cycleStartDay: Number(e.target.value) })}>
                {Array.from({ length: year.cycleLength }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
              </select></Field>
            </div>
          )}
          {year.scheduleType === 'biweekly' && <p className="small muted">The week containing the first day is an “A” week; weeks alternate after that.</p>}
          <p className="small muted">{days.length} school days. Set each class’s meeting times on the <a href="#/classes">Classes</a> page.</p>
        </section>

        <section className="card">
          <h2>No-school days</h2>
          <NonSchoolDays year={year} editYear={editYear} />
        </section>

        <section className="card wide">
          <h2>Alternate day schedules</h2>
          <p className="small muted">Define special days — half days, assemblies, planning days — with their own class times. Assign them to dates here or from the day menu in the planner.</p>
          <DayTypes year={year} editYear={editYear} classes={classes} />
        </section>

        <section className="card wide">
          <h2>Daily changes</h2>
          <p className="small muted">Extra classes and classes removed from individual days (managed from the planner).</p>
          {(year.overrides || []).length === 0 ? <Empty>None yet.</Empty> : (
            <table className="table">
              <tbody>
                {[...year.overrides].sort((a, b) => a.date.localeCompare(b.date)).map((o) => (
                  <tr key={o.id}>
                    <td>{formatDate(o.date)}</td>
                    <td>{classes.find((c) => c.id === o.classId)?.name}</td>
                    <td>{o.type === 'add' ? `Extra class ${o.start}–${o.end}` : 'Removed'}</td>
                    <td><button className="icon-btn" onClick={() => editYear((y) => { y.overrides = y.overrides.filter((x) => x.id !== o.id); })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {rollover && <RolloverDialog onClose={() => setRollover(false)} onDone={() => notify('New year created from last year’s schedule and lessons')} />}
    </div>
  );
}

function NonSchoolDays({ year, editYear }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [label, setLabel] = useState('');
  const list = [...(year.nonSchoolDays || [])].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      <div className="row wrap">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End (optional)" title="End (optional)" />
        <input placeholder="Holiday, break…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button disabled={!start} onClick={() => { editYear((y) => y.nonSchoolDays.push({ start, end: end || undefined, label: label || 'No school' })); setStart(''); setEnd(''); setLabel(''); }}>Add</button>
      </div>
      <ul className="list">
        {list.map((r, i) => (
          <li key={`${r.start}-${i}`}>
            <span>{formatDate(r.start)}{r.end && r.end !== r.start ? ` – ${formatDate(r.end)}` : ''}</span>
            <span className="grow">{r.label}</span>
            <button className="icon-btn" onClick={() => editYear((y) => { y.nonSchoolDays = y.nonSchoolDays.filter((x) => !(x.start === r.start && x.label === r.label)); })}>✕</button>
          </li>
        ))}
      </ul>
    </>
  );
}

function DayTypes({ year, editYear, classes }) {
  const [assignDate, setAssignDate] = useState({});
  const types = year.dayTypes || [];
  const assignments = Object.entries(year.dayAssignments || {});
  return (
    <>
      {types.map((t) => (
        <div key={t.id} className="subcard">
          <div className="row">
            <input value={t.name} onChange={(e) => editYear((y) => { y.dayTypes.find((x) => x.id === t.id).name = e.target.value; })} />
            {year.scheduleType === 'cycle' && (
              <label className="row small"><input type="checkbox" checked={t.countsInRotation !== false} onChange={(e) => editYear((y) => { y.dayTypes.find((x) => x.id === t.id).countsInRotation = e.target.checked; })} /> Counts as a cycle day</label>
            )}
            <span className="grow" />
            <button className="danger" onClick={() => editYear((y) => {
              y.dayTypes = y.dayTypes.filter((x) => x.id !== t.id);
              for (const [d, id] of Object.entries(y.dayAssignments)) if (id === t.id) delete y.dayAssignments[d];
            })}>Delete</button>
          </div>
          <table className="table compact">
            <thead><tr><th>Class</th><th>Meets?</th><th>Start</th><th>End</th></tr></thead>
            <tbody>
              {classes.map((c) => {
                const s = t.slots.find((x) => x.classId === c.id);
                const setSlot = (patch) => editYear((y) => {
                  const tt = y.dayTypes.find((x) => x.id === t.id);
                  const ex = tt.slots.find((x) => x.classId === c.id);
                  if (patch === null) tt.slots = tt.slots.filter((x) => x.classId !== c.id);
                  else if (ex) Object.assign(ex, patch);
                  else tt.slots.push({ classId: c.id, start: '08:00', end: '08:30', ...patch });
                });
                return (
                  <tr key={c.id}>
                    <td><span className="dot" style={{ background: c.color }} /> {c.name}</td>
                    <td><input type="checkbox" checked={!!s} onChange={(e) => setSlot(e.target.checked ? {} : null)} /></td>
                    <td>{s && <input type="time" value={s.start} onChange={(e) => setSlot({ start: e.target.value })} />}</td>
                    <td>{s && <input type="time" value={s.end} onChange={(e) => setSlot({ end: e.target.value })} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row wrap">
            <input type="date" value={assignDate[t.id] || ''} onChange={(e) => setAssignDate({ ...assignDate, [t.id]: e.target.value })} />
            <button disabled={!assignDate[t.id]} onClick={() => editYear((y) => { y.dayAssignments[assignDate[t.id]] = t.id; })}>Assign to date</button>
            {assignments.filter(([, id]) => id === t.id).sort().map(([d]) => (
              <span key={d} className="chip">{formatDate(d)}<button className="chip-x" onClick={() => editYear((y) => { delete y.dayAssignments[d]; })}>×</button></span>
            ))}
          </div>
        </div>
      ))}
      <button onClick={() => editYear((y) => { y.dayTypes = [...(y.dayTypes || []), { id: uid('day'), name: 'Half Day', countsInRotation: true, slots: [] }]; })}>+ New alternate day</button>
    </>
  );
}

function RolloverDialog({ onClose, onDone }) {
  const { state, update, year } = useStore();
  const [name, setName] = useState(year.name.replace(/(\d{4})/g, (m) => String(Number(m) + 1)));
  const [start, setStart] = useState(shiftYear(year.start, 1));
  const [end, setEnd] = useState(shiftYear(year.end, 1));
  const [copyLessons, setCopyLessons] = useState(true);
  const go = () => {
    const out = rolloverYear(state, year.id, { name, start, end, copyLessons });
    update((d) => {
      d.years.push(out.year);
      d.classes.push(...out.classes);
      Object.assign(d.lessons, out.lessons);
      d.currentYearId = out.year.id;
    });
    onDone();
    onClose();
  };
  return (
    <Modal title="Re-use this year’s schedule and lessons" onClose={onClose}
      footer={<><span className="grow" /><button onClick={onClose}>Cancel</button><button className="primary" onClick={go}>Create year</button></>}>
      <p className="small">Copies classes, sections, meeting times, templates, alternate day schedules and holidays (shifted one year). Rosters and grades start empty. Last year stays unchanged.</p>
      <Field label="New year name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="row">
        <Field label="First day"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Last day"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <label className="row"><input type="checkbox" checked={copyLessons} onChange={(e) => setCopyLessons(e.target.checked)} /> Copy lessons in the same order (they’ll flow onto the new calendar)</label>
    </Modal>
  );
}
