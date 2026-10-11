import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canEdit, canView, makeClass, uid, yearClasses } from '../lib/model.js';
import { pruneOrphans } from '../lib/actions.js';
import { dayKeyLabel, dayKeysFor } from '../lib/schedule.js';
import { CLASS_COLORS, FONTS, FONT_SIZES } from '../data/presets.js';
import { ColorInput, Field, Tabs, Empty } from '../components/ui.jsx';
import { SectionsEditor, SharingEditor } from '../components/ContainerEditors.jsx';

export default function Classes() {
  const { state, update, year, userId, notify } = useStore();
  const classes = yearClasses(state, year.id).filter((c) => canView(c, userId));
  const [selected, setSelected] = useState(classes[0]?.id);
  const [tab, setTab] = useState('general');
  const cls = classes.find((c) => c.id === selected);
  const edit = (fn) => update((d) => fn(d.classes.find((c) => c.id === selected)));
  const editable = cls && canEdit(cls, userId);

  const addClass = () => {
    const c = makeClass({ yearId: year.id, ownerId: userId, name: `Class ${classes.length + 1}`, color: CLASS_COLORS[classes.length % CLASS_COLORS.length], order: classes.length });
    update((d) => { d.classes.push(c); });
    setSelected(c.id);
    setTab('general');
  };
  const deleteClass = () => {
    if (!window.confirm(`Delete “${cls.name}” and all its lessons, roster and grades?`)) return;
    update((d) => {
      d.classes = d.classes.filter((c) => c.id !== cls.id);
      for (const y of d.years) {
        y.overrides = (y.overrides || []).filter((o) => o.classId !== cls.id);
        for (const t of y.dayTypes || []) t.slots = t.slots.filter((s) => s.classId !== cls.id);
      }
      pruneOrphans(d);
    });
    setSelected(null);
    notify('Class deleted');
  };

  return (
    <div className="page split">
      <aside className="side-list">
        <div className="row"><h1 className="grow">Classes</h1><button className="primary" onClick={addClass}>+ Class</button></div>
        {classes.map((c) => (
          <button key={c.id} className={`side-item ${c.id === selected ? 'on' : ''}`} onClick={() => setSelected(c.id)}>
            <span className="dot" style={{ background: c.color }} /> {c.name}
            {c.ownerId !== userId && <span className="badge">shared</span>}
          </button>
        ))}
        {classes.length === 0 && <Empty>No classes in {year.name}.</Empty>}
      </aside>
      {cls ? (
        <section className="detail">
          <Tabs value={tab} onChange={setTab} tabs={[['general', 'General'], ['schedule', 'Meeting times'], ['sections', 'Lesson sections'], ['templates', 'Templates'], ['sharing', 'Sharing'], ['roster', 'Roster']]} />
          <fieldset disabled={!editable} className="plain">
            {tab === 'general' && (
              <div className="card">
                <Field label="Class name"><input value={cls.name} onChange={(e) => edit((c) => { c.name = e.target.value; })} /></Field>
                <Field label="Room"><input value={cls.room} onChange={(e) => edit((c) => { c.room = e.target.value; })} /></Field>
                <Field label="Color"><ColorInput value={cls.color} swatches={CLASS_COLORS} onChange={(v) => edit((c) => { c.color = v; })} /></Field>
                <div className="row">
                  <Field label="Font">
                    <select value={cls.font} onChange={(e) => edit((c) => { c.font = e.target.value; })}>
                      {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Text size">
                    <select value={cls.fontSize} onChange={(e) => edit((c) => { c.fontSize = e.target.value; })}>
                      {FONT_SIZES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Display order"><input type="number" value={cls.order} onChange={(e) => edit((c) => { c.order = Number(e.target.value); })} /></Field>
                </div>
                {cls.ownerId === userId && <button className="danger" onClick={deleteClass}>Delete class</button>}
              </div>
            )}
            {tab === 'schedule' && <SlotsEditor cls={cls} edit={edit} year={year} />}
            {tab === 'sections' && <div className="card"><SectionsEditor container={cls} edit={edit} /></div>}
            {tab === 'templates' && (
              <div className="card">
                <p className="small muted">Templates checked here are added to every lesson in this class automatically. Remove or add templates on individual lessons from the lesson editor.</p>
                {state.templates.length === 0 && <Empty>No templates yet. <a href="#/templates">Create one</a>.</Empty>}
                {state.templates.map((t) => (
                  <label key={t.id} className="row">
                    <input type="checkbox" checked={cls.templateIds.includes(t.id)} onChange={(e) => edit((c) => { c.templateIds = e.target.checked ? [...c.templateIds, t.id] : c.templateIds.filter((x) => x !== t.id); })} />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
            {tab === 'sharing' && <div className="card"><SharingEditor container={cls} edit={edit} /></div>}
            {tab === 'roster' && <Roster cls={cls} edit={edit} />}
          </fieldset>
        </section>
      ) : <section className="detail"><Empty>Select or create a class.</Empty></section>}
    </div>
  );
}

function SlotsEditor({ cls, edit, year }) {
  const keys = dayKeysFor(year);
  const [bulkStart, setBulkStart] = useState('08:00');
  const [bulkEnd, setBulkEnd] = useState('08:50');
  const slotFor = (k) => cls.slots.find((s) => s.dayKey === k);
  const setSlot = (k, patch) => edit((c) => {
    const ex = c.slots.find((s) => s.dayKey === k);
    if (patch === null) c.slots = c.slots.filter((s) => s.dayKey !== k);
    else if (ex) Object.assign(ex, patch);
    else c.slots.push({ dayKey: k, start: bulkStart, end: bulkEnd, ...patch });
  });
  return (
    <div className="card">
      <p className="small muted">Pick the {year.scheduleType === 'cycle' ? 'cycle days' : year.scheduleType === 'biweekly' ? 'A/B week days' : 'weekdays'} this class meets and its times.</p>
      <div className="row wrap">
        <span className="small">Default time</span>
        <input type="time" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
        <input type="time" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} />
        <button onClick={() => edit((c) => { c.slots = keys.map((k) => ({ dayKey: k, start: bulkStart, end: bulkEnd })); })}>Meets every day at this time</button>
      </div>
      <table className="table compact">
        <thead><tr><th>Day</th><th>Meets</th><th>Start</th><th>End</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const s = slotFor(k);
            return (
              <tr key={k}>
                <td>{dayKeyLabel(k)}</td>
                <td><input type="checkbox" checked={!!s} onChange={(e) => setSlot(k, e.target.checked ? {} : null)} /></td>
                <td>{s && <input type="time" value={s.start} onChange={(e) => setSlot(k, { start: e.target.value })} />}</td>
                <td>{s && <input type="time" value={s.end} onChange={(e) => setSlot(k, { end: e.target.value })} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cls.slots.some((s) => !keys.includes(s.dayKey)) && (
        <div className="notice">
          Some meeting times belong to a different schedule type.{' '}
          <button onClick={() => edit((c) => { c.slots = c.slots.filter((s) => keys.includes(s.dayKey)); })}>Remove them</button>
        </div>
      )}
    </div>
  );
}

function Roster({ cls, edit }) {
  const [bulk, setBulk] = useState('');
  const add = () => {
    const names = bulk.split('\n').map((l) => l.trim()).filter(Boolean);
    edit((c) => {
      for (const n of names) {
        const [a, b] = n.includes(',') ? n.split(',').map((x) => x.trim()).reverse() : [n.split(' ')[0], n.split(' ').slice(1).join(' ')];
        c.students.push({ id: uid('stu'), first: a, last: b || '', notes: '' });
      }
    });
    setBulk('');
  };
  return (
    <div className="card">
      <Field label="Add students" hint="One per line — “First Last” or “Last, First”.">
        <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} />
      </Field>
      <button onClick={add} disabled={!bulk.trim()}>Add to roster</button>
      <table className="table compact">
        <thead><tr><th>First</th><th>Last</th><th>Notes</th><th /></tr></thead>
        <tbody>
          {cls.students.map((s) => (
            <tr key={s.id}>
              <td><input value={s.first} onChange={(e) => edit((c) => { c.students.find((x) => x.id === s.id).first = e.target.value; })} /></td>
              <td><input value={s.last} onChange={(e) => edit((c) => { c.students.find((x) => x.id === s.id).last = e.target.value; })} /></td>
              <td><input value={s.notes} placeholder="IEP, 504, allergies…" onChange={(e) => edit((c) => { c.students.find((x) => x.id === s.id).notes = e.target.value; })} /></td>
              <td><button className="icon-btn" onClick={() => edit((c) => { c.students = c.students.filter((x) => x.id !== s.id); })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
