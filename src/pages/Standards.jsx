import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { allFrameworks, canEdit, canView, uid, yearClasses } from '../lib/model.js';
import { parseCSV, toCSV } from '../lib/csv.js';
import { achievement, standardsCoverage } from '../lib/reports.js';
import { formatDate, today } from '../lib/dates.js';
import { ACCOMMODATIONS, DIFFERENTIATION, STRATEGIES } from '../data/presets.js';
import { Chip, Empty, Field, Tabs, download } from '../components/ui.jsx';

export default function Standards() {
  const [tab, setTab] = useState('browse');
  return (
    <div className="page">
      <div className="page-head"><h1>Standards & Library</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['browse', 'Frameworks'], ['coverage', 'Coverage report'], ['achievement', 'Student achievement'], ['scale', 'Scoring scale'], ['library', 'Strategies & supports']]} />
      {tab === 'browse' && <Browse />}
      {tab === 'coverage' && <Coverage />}
      {tab === 'achievement' && <Achievement />}
      {tab === 'scale' && <Scale />}
      {tab === 'library' && <Library />}
    </div>
  );
}

function Browse() {
  const { state, update, notify } = useStore();
  const frameworks = allFrameworks(state);
  const [fwId, setFwId] = useState(frameworks[0]?.id);
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('');
  const fw = frameworks.find((f) => f.id === fwId);
  const custom = state.frameworks.some((f) => f.id === fwId);
  const grades = fw ? [...new Set(fw.standards.map((s) => s.grade))] : [];
  const list = (fw?.standards || []).filter((s) => (!grade || s.grade === grade) && (!q || `${s.code} ${s.description}`.toLowerCase().includes(q.toLowerCase())));
  const [form, setForm] = useState({ code: '', description: '', grade: '' });
  const [newFw, setNewFw] = useState('');

  const importCSV = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((text) => {
      const rows = parseCSV(text);
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (n) => header.indexOf(n);
      if (col('code') < 0 || col('description') < 0) { notify('CSV needs “code” and “description” columns (optional: grade, subject, framework).', true); return; }
      const byFw = {};
      for (const r of rows.slice(1)) {
        const name = (col('framework') >= 0 && r[col('framework')]) || file.name.replace(/\.csv$/i, '');
        (byFw[name] ||= { subject: col('subject') >= 0 ? r[col('subject')] : '', rows: [] }).rows.push(r);
      }
      update((d) => {
        for (const [name, { subject, rows: rs }] of Object.entries(byFw)) {
          const id = uid('fw');
          d.frameworks.push({
            id, name, subject: subject || 'Custom', region: 'Imported',
            standards: rs.map((r) => ({ id: `${id}:${r[col('code')]}`, code: r[col('code')], description: r[col('description')], grade: col('grade') >= 0 ? r[col('grade')] : '' })),
          });
        }
      });
      notify(`Imported ${rows.length - 1} standards`);
    });
  };

  return (
    <div className="split inner">
      <aside className="side-list">
        {frameworks.map((f) => (
          <button key={f.id} className={`side-item ${f.id === fwId ? 'on' : ''}`} onClick={() => { setFwId(f.id); setGrade(''); }}>
            <span className="grow">{f.name}<br /><span className="small muted">{f.region} · {f.subject} · {f.standards.length}</span></span>
          </button>
        ))}
        <div className="card">
          <div className="row">
            <input placeholder="New framework name" value={newFw} onChange={(e) => setNewFw(e.target.value)} className="grow" />
            <button disabled={!newFw.trim()} onClick={() => {
              const id = uid('fw');
              update((d) => { d.frameworks.push({ id, name: newFw.trim(), subject: 'Custom', region: 'Local', standards: [] }); });
              setFwId(id);
              setNewFw('');
            }}>+ Add</button>
          </div>
          <label className="btn">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={importCSV} /></label>
          <button className="link-btn small" onClick={() => download('standards-template.csv', toCSV([['framework', 'subject', 'code', 'grade', 'description'], ['My District Science', 'Science', 'SCI.6.1', '6', 'Describe…']]), 'text/csv')}>CSV template</button>
        </div>
      </aside>
      <section className="detail">
        {fw && (
          <>
            <div className="row wrap">
              <input placeholder="Search standards…" value={q} onChange={(e) => setQ(e.target.value)} className="grow" />
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">All grades</option>
                {grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}
              </select>
              {custom && <button className="danger" onClick={() => { if (window.confirm('Delete this framework?')) update((d) => { d.frameworks = d.frameworks.filter((f) => f.id !== fw.id); }); }}>Delete framework</button>}
            </div>
            <table className="table">
              <thead><tr><th>Code</th><th>Grade</th><th>Description</th>{custom && <th />}</tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap"><strong>{s.code}</strong></td>
                    <td>{s.grade}</td>
                    <td>{s.description}</td>
                    {custom && <td><button className="icon-btn" onClick={() => update((d) => { const f = d.frameworks.find((x) => x.id === fw.id); f.standards = f.standards.filter((x) => x.id !== s.id); })}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {custom && (
              <div className="row wrap card">
                <input placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                <input placeholder="Grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="mini" />
                <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="grow" />
                <button disabled={!form.code} onClick={() => {
                  update((d) => d.frameworks.find((x) => x.id === fw.id).standards.push({ id: `${fw.id}:${form.code}`, ...form }));
                  setForm({ code: '', description: '', grade: '' });
                }}>Add standard</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function useRange() {
  const { year } = useStore();
  const [start, setStart] = useState(year.start);
  const [end, setEnd] = useState(today() > year.end ? year.end : today());
  const ui = (
    <>
      <Field label="From"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="To"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
    </>
  );
  return { start, end, ui };
}

function Coverage() {
  const { state, calendar, classes, userId } = useStore();
  const visible = classes.filter((c) => canView(c, userId));
  const frameworks = allFrameworks(state);
  const [classId, setClassId] = useState('');
  const [fwId, setFwId] = useState(frameworks[0]?.id);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const { start, end, ui } = useRange();
  const fw = frameworks.find((f) => f.id === fwId);
  const chosen = classId ? visible.filter((c) => c.id === classId) : visible;
  const cov = useMemo(() => standardsCoverage(state, calendar, chosen, start, end), [state, calendar, chosen, start, end]);
  const rows = (fw?.standards || []).filter((s) => !onlyMissing || !cov[s.id]);
  const covered = (fw?.standards || []).filter((s) => cov[s.id]).length;

  const exportCsv = () => download('standards-coverage.csv', toCSV([
    ['Code', 'Description', 'Times taught', 'First', 'Last', 'Classes'],
    ...rows.map((s) => {
      const c = cov[s.id];
      return [s.code, s.description, c?.count || 0, c?.dates[0] || '', c?.dates.at(-1) || '', c ? [...c.classIds].map((id) => visible.find((x) => x.id === id)?.name).join('; ') : ''];
    }),
  ]), 'text/csv');

  return (
    <div className="card">
      <div className="row wrap">
        <Field label="Class">
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All my classes</option>
            {visible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Framework">
          <select value={fwId} onChange={(e) => setFwId(e.target.value)}>{frameworks.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        </Field>
        {ui}
        <label className="row small"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only not yet taught</label>
        <button onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="meter"><div style={{ width: `${fw?.standards.length ? (covered / fw.standards.length) * 100 : 0}%` }} /></div>
      <p className="small">{covered} of {fw?.standards.length || 0} standards addressed between {formatDate(start)} and {formatDate(end)}.</p>
      <table className="table">
        <thead><tr><th>Code</th><th>Description</th><th>Taught</th><th>Last taught</th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const c = cov[s.id];
            return (
              <tr key={s.id} className={c ? '' : 'row-missing'}>
                <td className="nowrap"><strong>{s.code}</strong></td>
                <td>{s.description}</td>
                <td>{c?.count || 0}</td>
                <td className="nowrap">{c ? formatDate(c.dates.at(-1)) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Achievement() {
  const { state, update, classes, userId } = useStore();
  const visible = classes.filter((c) => canView(c, userId));
  const [classId, setClassId] = useState(visible[0]?.id);
  const cls = visible.find((c) => c.id === classId);
  const frameworks = allFrameworks(state);
  const index = useMemo(() => Object.fromEntries(frameworks.flatMap((f) => f.standards.map((s) => [s.id, s]))), [frameworks]);
  const { start, end, ui } = useRange();
  const [recStd, setRecStd] = useState('');
  const [recDate, setRecDate] = useState(today());
  const [rec, setRec] = useState({});
  if (!cls) return <Empty>No classes.</Empty>;
  const editable = canEdit(cls, userId);
  const plannedStd = [...new Set([
    ...cls.sequence.flatMap((id) => state.lessons[id]?.standardIds || []),
    ...cls.gradebook.assignments.flatMap((a) => a.standardIds || []),
    ...cls.standardScores.map((s) => s.standardId),
  ])];
  const scoredStd = [...new Set(cls.standardScores.map((s) => s.standardId))];
  const scaleColor = (v) => {
    const sorted = [...state.scale].sort((a, b) => b.value - a.value);
    return (sorted.find((s) => v >= s.value) || sorted.at(-1))?.color;
  };
  const save = () => {
    update((d) => {
      const c = d.classes.find((x) => x.id === cls.id);
      for (const [studentId, score] of Object.entries(rec)) {
        if (score === '') continue;
        c.standardScores.push({ id: uid('ss'), studentId, standardId: recStd, date: recDate, score: Number(score) });
      }
    });
    setRec({});
  };

  return (
    <>
      <div className="card">
        <div className="row wrap">
          <Field label="Class">
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>{visible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          {ui}
        </div>
        {scoredStd.length === 0 ? <Empty>No standards scored yet for this class.</Empty> : (
          <div className="scroll-x">
            <table className="table compact">
              <thead>
                <tr><th>Student</th>{scoredStd.map((id) => <th key={id} title={index[id]?.description}>{index[id]?.code || id}</th>)}</tr>
              </thead>
              <tbody>
                {cls.students.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap">{s.last}, {s.first}</td>
                    {scoredStd.map((id) => {
                      const v = achievement(cls, id, start, end).latest[s.id];
                      return <td key={id}>{v ? <span className="score" style={{ background: scaleColor(v.score) }}>{v.score}</span> : ''}</td>;
                    })}
                  </tr>
                ))}
                <tr className="total">
                  <td>Class average</td>
                  {scoredStd.map((id) => {
                    const { avg } = achievement(cls, id, start, end);
                    return <td key={id}>{avg == null ? '' : avg.toFixed(1)}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="chips">{state.scale.map((s) => <Chip key={s.value} color={s.color}>{s.value} = {s.label}</Chip>)}</div>
      </div>
      {editable && (
        <div className="card">
          <h3>Record standard scores</h3>
          <div className="row wrap">
            <Field label="Standard">
              <select value={recStd} onChange={(e) => setRecStd(e.target.value)}>
                <option value="">Choose…</option>
                {plannedStd.map((id) => <option key={id} value={id}>{index[id]?.code || id}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} /></Field>
          </div>
          {recStd && (
            <>
              <p className="small">{index[recStd]?.description}</p>
              <div className="score-grid">
                {cls.students.map((s) => (
                  <label key={s.id} className="row">
                    <span className="grow">{s.first} {s.last}</span>
                    <select value={rec[s.id] ?? ''} onChange={(e) => setRec({ ...rec, [s.id]: e.target.value })}>
                      <option value="">—</option>
                      {state.scale.map((x) => <option key={x.value} value={x.value}>{x.value} {x.label}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <button className="primary" onClick={save} disabled={!Object.values(rec).some((v) => v !== '')}>Save scores</button>
            </>
          )}
          {plannedStd.length === 0 && <p className="small muted">Add standards to lessons or assignments to score them here.</p>}
        </div>
      )}
    </>
  );
}

function Scale() {
  const { state, update } = useStore();
  const edit = (fn) => update((d) => fn(d.scale));
  return (
    <div className="card">
      <p className="small muted">Your scale for scoring student achievement on standards (e.g. 1–4 proficiency, or 0–100).</p>
      <table className="table compact">
        <thead><tr><th>Value</th><th>Label</th><th>Color</th><th /></tr></thead>
        <tbody>
          {state.scale.map((s, i) => (
            <tr key={i}>
              <td><input type="number" className="mini" value={s.value} onChange={(e) => edit((sc) => { sc[i].value = Number(e.target.value); })} /></td>
              <td><input value={s.label} onChange={(e) => edit((sc) => { sc[i].label = e.target.value; })} /></td>
              <td><input type="color" value={s.color} onChange={(e) => edit((sc) => { sc[i].color = e.target.value; })} /></td>
              <td><button className="icon-btn" onClick={() => edit((sc) => { sc.splice(i, 1); })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => edit((sc) => { sc.push({ value: 0, label: 'New level', color: '#64748b' }); })}>+ Level</button>
    </div>
  );
}

function Library() {
  const { state, update } = useStore();
  const kinds = [['strategies', 'Teaching strategies', STRATEGIES], ['differentiation', 'Differentiation', DIFFERENTIATION], ['accommodations', 'Accommodations', ACCOMMODATIONS]];
  const [input, setInput] = useState({});
  return (
    <div className="cards">
      {kinds.map(([key, label, preset]) => (
        <div key={key} className="card">
          <h3>{label}</h3>
          <div className="chips">
            {preset.map((p) => <Chip key={p}>{p}</Chip>)}
            {(state.library[key] || []).map((p) => (
              <Chip key={p} color="#2563eb" onRemove={() => update((d) => { d.library[key] = d.library[key].filter((x) => x !== p); })}>{p}</Chip>
            ))}
          </div>
          <div className="row">
            <input value={input[key] || ''} placeholder="Add your own…" onChange={(e) => setInput({ ...input, [key]: e.target.value })} />
            <button disabled={!input[key]?.trim()} onClick={() => { update((d) => { d.library[key] = [...new Set([...(d.library[key] || []), input[key].trim()])]; }); setInput({ ...input, [key]: '' }); }}>Add</button>
          </div>
        </div>
      ))}
    </div>
  );
}
