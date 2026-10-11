import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canEdit, canView, standardIndex, uid } from '../lib/model.js';
import { achievement, letterGrade, studentAverage } from '../lib/reports.js';
import { toCSV } from '../lib/csv.js';
import { formatDate, today } from '../lib/dates.js';
import { Empty, Field, Modal, MultiPicker, download } from '../components/ui.jsx';

export default function Gradebook() {
  const { state, update, classes, userId, year } = useStore();
  const visible = classes.filter((c) => canView(c, userId));
  const [classId, setClassId] = useState(visible[0]?.id);
  const [report, setReport] = useState(null);
  const [adding, setAdding] = useState(false);
  const cls = visible.find((c) => c.id === classId);
  if (!cls) return <div className="page"><Empty>Create a class to use the gradebook.</Empty></div>;
  const gb = cls.gradebook;
  const editable = canEdit(cls, userId);
  const edit = (fn) => update((d) => fn(d.classes.find((c) => c.id === cls.id).gradebook));
  const assignments = [...gb.assignments].sort((a, b) => a.date.localeCompare(b.date));
  const students = [...cls.students].sort((a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`));

  const exportCsv = () => download(`${cls.name}-grades.csv`, toCSV([
    ['Last', 'First', ...assignments.map((a) => `${a.name} (${a.points})`), 'Average', 'Grade'],
    ...students.map((s) => {
      const avg = studentAverage(gb, s.id);
      return [s.last, s.first, ...assignments.map((a) => gb.scores?.[a.id]?.[s.id] ?? ''), avg == null ? '' : avg.toFixed(1), letterGrade(avg)];
    }),
  ]), 'text/csv');

  return (
    <div className="page">
      <div className="page-head">
        <h1>Gradebook</h1>
        <div className="row wrap">
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>{visible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {editable && <button className="primary" onClick={() => setAdding(true)}>+ Assignment</button>}
          <button onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <details className="card">
        <summary>Categories & weights</summary>
        <table className="table compact">
          <tbody>
            {gb.categories.map((c, i) => (
              <tr key={c.id}>
                <td><input value={c.name} disabled={!editable} onChange={(e) => edit((g) => { g.categories[i].name = e.target.value; })} /></td>
                <td><input type="number" className="mini" value={c.weight} disabled={!editable} onChange={(e) => edit((g) => { g.categories[i].weight = Number(e.target.value); })} /> %</td>
                <td>{editable && gb.categories.length > 1 && <button className="icon-btn" onClick={() => edit((g) => {
                  g.categories.splice(i, 1);
                  for (const a of g.assignments) if (a.categoryId === c.id) a.categoryId = g.categories[0].id;
                })}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && <button onClick={() => edit((g) => { g.categories.push({ id: uid('cat'), name: 'New category', weight: 0 }); })}>+ Category</button>}
        <p className="small muted">Total weight: {gb.categories.reduce((a, c) => a + (Number(c.weight) || 0), 0)}%. Averages normalize over categories that have scores.</p>
      </details>

      {students.length === 0 ? <Empty>Add students on the <a href="#/classes">Classes → Roster</a> tab.</Empty> : (
        <div className="scroll-x card">
          <table className="table grade-table">
            <thead>
              <tr>
                <th>Student</th>
                {assignments.map((a) => (
                  <th key={a.id} title={`${formatDate(a.date)} · ${gb.categories.find((c) => c.id === a.categoryId)?.name}`}>
                    <div>{a.name}</div>
                    <div className="small muted">{a.points} pts</div>
                    {editable && <button className="icon-btn small" onClick={() => { if (window.confirm(`Delete “${a.name}” and its scores?`)) edit((g) => { g.assignments = g.assignments.filter((x) => x.id !== a.id); delete g.scores[a.id]; }); }}>✕</button>}
                  </th>
                ))}
                <th>Average</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const avg = studentAverage(gb, s.id);
                return (
                  <tr key={s.id}>
                    <td className="nowrap"><button className="link-btn" onClick={() => setReport(s)}>{s.last}, {s.first}</button></td>
                    {assignments.map((a) => {
                      const v = gb.scores?.[a.id]?.[s.id] ?? '';
                      const low = v !== '' && Number(v) / a.points < 0.6;
                      return (
                        <td key={a.id}>
                          <input
                            className={`score-input ${low ? 'low' : ''}`}
                            inputMode="decimal"
                            value={v}
                            disabled={!editable}
                            onChange={(e) => edit((g) => { g.scores[a.id] = { ...(g.scores[a.id] || {}), [s.id]: e.target.value }; })}
                          />
                        </td>
                      );
                    })}
                    <td className="nowrap"><strong>{avg == null ? '—' : `${avg.toFixed(1)}%`}</strong> {letterGrade(avg)}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>Class average</td>
                {assignments.map((a) => {
                  const vals = students.map((s) => gb.scores?.[a.id]?.[s.id]).filter((v) => v !== '' && v != null).map(Number);
                  return <td key={a.id}>{vals.length ? `${((vals.reduce((x, y) => x + y, 0) / vals.length / a.points) * 100).toFixed(0)}%` : ''}</td>;
                })}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {adding && <AssignmentDialog cls={cls} onClose={() => setAdding(false)} />}
      {report && <StudentReport cls={cls} student={report} yearStart={year.start} onClose={() => setReport(null)} />}
    </div>
  );
}

function AssignmentDialog({ cls, onClose }) {
  const { state, update } = useStore();
  const [a, setA] = useState({ name: '', categoryId: cls.gradebook.categories[0].id, date: today(), points: 10, standardIds: [] });
  const stdOptions = useMemo(() => Object.values(standardIndex(state)).map((s) => ({ value: s.id, label: s.code, sub: s.description })), [state]);
  const save = () => {
    update((d) => d.classes.find((c) => c.id === cls.id).gradebook.assignments.push({ id: uid('asg'), ...a, points: Number(a.points) }));
    onClose();
  };
  return (
    <Modal title="New assignment" onClose={onClose} footer={<><span className="grow" /><button onClick={onClose}>Cancel</button><button className="primary" disabled={!a.name} onClick={save}>Add</button></>}>
      <Field label="Name"><input value={a.name} autoFocus onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
      <div className="row">
        <Field label="Category"><select value={a.categoryId} onChange={(e) => setA({ ...a, categoryId: e.target.value })}>{cls.gradebook.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={a.date} onChange={(e) => setA({ ...a, date: e.target.value })} /></Field>
        <Field label="Points"><input type="number" className="mini" value={a.points} onChange={(e) => setA({ ...a, points: e.target.value })} /></Field>
      </div>
      <Field label="Standards assessed"><MultiPicker options={stdOptions} value={a.standardIds} onChange={(standardIds) => setA({ ...a, standardIds })} /></Field>
    </Modal>
  );
}

function StudentReport({ cls, student, yearStart, onClose }) {
  const { state } = useStore();
  const gb = cls.gradebook;
  const std = standardIndex(state);
  const avg = studentAverage(gb, student.id);
  const scored = [...new Set(cls.standardScores.filter((s) => s.studentId === student.id).map((s) => s.standardId))];
  const label = (v) => [...state.scale].sort((a, b) => b.value - a.value).find((s) => v >= s.value);
  return (
    <Modal title={`${student.first} ${student.last} — ${cls.name}`} onClose={onClose} wide footer={<><span className="grow" /><button onClick={() => window.print()}>Print</button></>}>
      <p><strong>Average:</strong> {avg == null ? '—' : `${avg.toFixed(1)}% (${letterGrade(avg)})`}</p>
      {student.notes && <p className="small"><strong>Notes:</strong> {student.notes}</p>}
      <table className="table compact">
        <thead><tr><th>Assignment</th><th>Date</th><th>Score</th></tr></thead>
        <tbody>
          {gb.assignments.map((a) => {
            const v = gb.scores?.[a.id]?.[student.id];
            return <tr key={a.id}><td>{a.name}</td><td>{formatDate(a.date)}</td><td>{v === '' || v == null ? <span className="muted">missing</span> : `${v} / ${a.points}`}</td></tr>;
          })}
        </tbody>
      </table>
      <h3>Standards</h3>
      {scored.length === 0 ? <p className="muted small">No standards scored.</p> : (
        <table className="table compact">
          <tbody>
            {scored.map((id) => {
              const v = achievement(cls, id, yearStart, '9999-12-31').latest[student.id];
              const l = v && label(v.score);
              return <tr key={id}><td><strong>{std[id]?.code || id}</strong> <span className="small">{std[id]?.description}</span></td><td className="nowrap"><span className="score" style={{ background: l?.color }}>{v?.score}</span> {l?.label}</td></tr>;
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
