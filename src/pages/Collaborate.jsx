import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canEdit, canView, containerRole, makeBank, makeLesson } from '../lib/model.js';
import { copyLesson, editSequence, pruneOrphans } from '../lib/actions.js';
import { insertAt, pullBack, swap } from '../lib/sequence.js';
import { meetingIndexOnOrAfter } from '../lib/schedule.js';
import { formatDate, today } from '../lib/dates.js';
import LessonEditor from '../components/LessonEditor.jsx';
import { SectionsEditor, SharingEditor } from '../components/ContainerEditors.jsx';
import { StatusChips } from '../components/LessonContent.jsx';
import { Empty, Field, Modal, Tabs } from '../components/ui.jsx';

export default function Collaborate() {
  const { state, update, userId } = useStore();
  const banks = state.banks.filter((b) => canView(b, userId));
  const sharedClasses = state.classes.filter((c) => c.ownerId !== userId && canView(c, userId));
  const [selected, setSelected] = useState(banks[0]?.id);
  const [linking, setLinking] = useState(null);
  const bank = banks.find((b) => b.id === selected);

  const newBank = () => {
    const b = makeBank({ ownerId: userId, name: 'New Team Bank' });
    update((d) => { d.banks.push(b); });
    setSelected(b.id);
  };

  return (
    <div className="page split">
      <aside className="side-list">
        <div className="row"><h1 className="grow">Collaborate</h1><button className="primary" onClick={newBank}>+ Bank</button></div>
        <h3>Lesson banks</h3>
        {banks.map((b) => (
          <button key={b.id} className={`side-item ${b.id === selected ? 'on' : ''}`} onClick={() => setSelected(b.id)}>
            <span className="dot" style={{ background: b.color }} /> {b.name}
            <span className="badge">{containerRole(b, userId)}</span>
          </button>
        ))}
        {banks.length === 0 && <Empty>No banks yet.</Empty>}
        <h3>Classes shared with me</h3>
        {sharedClasses.map((c) => (
          <div key={c.id} className="side-item static">
            <span className="dot" style={{ background: c.color }} /> {c.name}
            <button className="link-btn" onClick={() => setLinking(c)}>Link…</button>
          </div>
        ))}
        {sharedClasses.length === 0 && <p className="small muted">None.</p>}
      </aside>
      <section className="detail">
        {bank ? <BankDetail key={bank.id} bank={bank} onLink={() => setLinking(bank)} /> : <Empty>Create a team lesson bank to build shared curriculum, then link it into your class plans.</Empty>}
      </section>
      {linking && <LinkDialog source={linking} onClose={() => setLinking(null)} />}
    </div>
  );
}

function BankDetail({ bank, onLink }) {
  const { state, update, userId, notify } = useStore();
  const [tab, setTab] = useState('lessons');
  const [editing, setEditing] = useState(null);
  const editable = canEdit(bank, userId);
  const edit = (fn) => update((d) => fn(d.banks.find((b) => b.id === bank.id)));

  const addLesson = () => {
    const l = makeLesson({ homeType: 'bank', homeId: bank.id, ownerId: userId, title: 'New lesson' });
    update((d) => { d.lessons[l.id] = l; d.banks.find((b) => b.id === bank.id).sequence.push(l.id); });
    setEditing({ containerId: bank.id, index: bank.sequence.length });
  };

  return (
    <>
      <div className="row">
        <input className="title-input grow" value={bank.name} disabled={!editable} onChange={(e) => edit((b) => { b.name = e.target.value; })} />
        <input type="color" value={bank.color} disabled={!editable} onChange={(e) => edit((b) => { b.color = e.target.value; })} />
        <button className="primary" onClick={onLink}>Link into my class…</button>
      </div>
      <p className="small muted">Owner: {state.users.find((u) => u.id === bank.ownerId)?.name} · Your access: {containerRole(bank, userId)}</p>
      <Tabs value={tab} onChange={setTab} tabs={[['lessons', `Lessons (${bank.sequence.length})`], ['sections', 'Sections'], ['sharing', 'Sharing']]} />
      {tab === 'lessons' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>#</th><th>Lesson</th><th>Status</th><th>Used in</th><th /></tr></thead>
            <tbody>
              {bank.sequence.map((id, i) => {
                const l = state.lessons[id];
                const usedIn = state.classes.filter((c) => c.sequence.includes(id)).map((c) => c.name);
                return (
                  <tr key={`${id}-${i}`} className="clickable" onClick={() => setEditing({ containerId: bank.id, index: i })}>
                    <td className="muted">{i + 1}</td>
                    <td>{l?.title || <span className="muted">Untitled</span>}</td>
                    <td><StatusChips ids={l?.statusIds} /></td>
                    <td className="small">{usedIn.join(', ')}</td>
                    <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                      {editable && (
                        <>
                          <button className="icon-btn" disabled={i === 0} onClick={() => update((d) => editSequence(d, bank.id, (s) => swap(s, i, i - 1)))}>↑</button>
                          <button className="icon-btn" disabled={i === bank.sequence.length - 1} onClick={() => update((d) => editSequence(d, bank.id, (s) => swap(s, i, i + 1)))}>↓</button>
                          <button className="icon-btn" title="Delete" onClick={() => {
                            if (usedIn.length && !window.confirm(`This lesson is linked into ${usedIn.join(', ')}. Delete it from the bank anyway? (Linked copies stay in those classes.)`)) return;
                            update((d) => { editSequence(d, bank.id, (s) => pullBack(s, i)); pruneOrphans(d); });
                            notify('Lesson removed from bank', { undo: true });
                          }}>✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editable && <button onClick={addLesson}>+ Add lesson</button>}
        </div>
      )}
      {tab === 'sections' && <fieldset className="plain card" disabled={!editable}><SectionsEditor container={bank} edit={edit} /></fieldset>}
      {tab === 'sharing' && <div className="card"><SharingEditor container={bank} edit={edit} /></div>}
      {editing && <LessonEditor {...editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Link (or copy) lessons from a shared class/bank into one of my classes. */
export function LinkDialog({ source, onClose }) {
  const { state, update, calendar, classes, userId, notify } = useStore();
  const mine = classes.filter((c) => canEdit(c, userId) && c.id !== source.id);
  const ids = source.sequence.filter(Boolean);
  const [classId, setClassId] = useState(mine[0]?.id);
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(ids.length);
  const [mode, setMode] = useState('link');
  const [skip, setSkip] = useState([]);
  const chosen = ids.slice(from - 1, to).filter((id) => !skip.includes(id));
  const startIdx = classId ? meetingIndexOnOrAfter(calendar, classId, date) : 0;
  const startMeeting = calendar.byClass[classId]?.[startIdx];

  const go = () => {
    update((d) => {
      chosen.forEach((lid, i) => {
        const id = mode === 'copy' ? copyLesson(d, lid, classId, userId) : lid;
        editSequence(d, classId, (s) => insertAt(s, startIdx + i, id));
      });
    });
    notify(`${chosen.length} lesson(s) ${mode === 'copy' ? 'copied' : 'linked'} into ${classes.find((c) => c.id === classId)?.name}`);
    onClose();
  };

  return (
    <Modal title={`Link from “${source.name}”`} onClose={onClose} wide
      footer={<><span className="grow" /><button onClick={onClose}>Cancel</button><button className="primary" disabled={!classId || !chosen.length} onClick={go}>{mode === 'copy' ? 'Copy' : 'Link'} {chosen.length} lesson(s)</button></>}>
      {mine.length === 0 ? <Empty>You need a class of your own to link into.</Empty> : (
        <>
          <div className="row wrap">
            <Field label="Into my class">
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <Field label="Starting on"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Lessons from #"><input type="number" min="1" max={ids.length} value={from} onChange={(e) => setFrom(Number(e.target.value))} /></Field>
            <Field label="to #"><input type="number" min={from} max={ids.length} value={to} onChange={(e) => setTo(Number(e.target.value))} /></Field>
            <Field label="Mode">
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="link">Link (stays in sync with source)</option>
                <option value="copy">Copy (my own editable version)</option>
              </select>
            </Field>
          </div>
          <p className="small">
            {startMeeting ? <>Starts {formatDate(startMeeting.date, { weekday: 'long', month: 'short', day: 'numeric' })}; lessons already scheduled from then on are bumped forward.</> : 'No meetings on or after that date.'}
          </p>
          <div className="checklist">
            {ids.slice(from - 1, to).map((id, i) => (
              <label key={`${id}-${i}`} className="row">
                <input type="checkbox" checked={!skip.includes(id)} onChange={(e) => setSkip(e.target.checked ? skip.filter((x) => x !== id) : [...skip, id])} />
                {from + i}. {state.lessons[id]?.title || 'Untitled'}
              </label>
            ))}
          </div>
          <p className="small muted">Linked lessons keep your full control over the schedule — bump, remove or reorder them in your class without affecting the source. Add private notes on any linked lesson; only you see them.</p>
        </>
      )}
    </Modal>
  );
}
