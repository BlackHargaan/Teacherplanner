import { Fragment, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { allFrameworks, canEdit, canView, isBuiltinFramework, uid, yearClasses } from '../lib/model.js';
import { parseCSV, toCSVFile } from '../lib/csv.js';
import { achievement, standardsCoverage } from '../lib/reports.js';
import { formatDate, today } from '../lib/dates.js';
import { ACCOMMODATIONS, DIFFERENTIATION, STRATEGIES } from '../data/presets.js';
import { Chip, Empty, Field, Tabs, download } from '../components/ui.jsx';
import StateStandardsPicker from '../components/StateStandardsPicker.jsx';
import { VERSION_DATE, fetchCatalog, fetchFramework, updatedFramework, updatesAvailable, usedStandardIds } from '../lib/standardsCatalog.js';

const LIST_LIMIT = 400;

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
  const fromCatalog = Boolean(fw?.source?.catalog);
  // Official state standards are read-only; teachers can remove or update the set.
  const builtin = isBuiltinFramework(fwId);
  const custom = state.frameworks.some((f) => f.id === fwId) && !fromCatalog;
  const hiddenCount = (state.hiddenFrameworks || []).length;
  const gradesOf = (s) => (s.grades?.length ? s.grades : s.grade ? [s.grade] : []);
  const grades = fw ? [...new Set(fw.standards.flatMap(gradesOf))] : [];
  const list = (fw?.standards || []).filter((s) => (!grade || gradesOf(s).includes(grade)) && (!q || `${s.code} ${s.description} ${s.group || ''}`.toLowerCase().includes(q.toLowerCase())));
  const shown = list.slice(0, LIST_LIMIT);
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkForUpdate = async () => {
    setChecking(true);
    try {
      const catalog = await fetchCatalog();
      if (!updatesAvailable([fw], catalog).length) { notify('These standards are up to date.'); return; }
      const data = await fetchFramework(fw.source.id);
      const used = usedStandardIds(state);
      update((d) => {
        const i = d.frameworks.findIndex((f) => f.id === fw.id);
        if (i >= 0) d.frameworks[i] = updatedFramework(d.frameworks[i], data, used);
      });
      notify(`Updated ${fw.name}`);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setChecking(false);
    }
  };

  const removeFramework = () => {
    const used = usedStandardIds(state);
    const tagged = fw.standards.filter((s) => used.has(s.id)).length;
    const msg = tagged
      ? `Remove “${fw.name}”? ${tagged} of its standards are tagged in lessons, assignments or scores. ${builtin ? 'Those tags keep working.' : 'The tags stay, but they’ll show as codes only until you add these standards again.'}`
      : `Remove “${fw.name}”?`;
    if (!window.confirm(msg)) return;
    update((d) => {
      // Built-in samples are hidden rather than deleted, so they can come back.
      if (builtin) d.hiddenFrameworks = [...new Set([...(d.hiddenFrameworks || []), fw.id])];
      else d.frameworks = d.frameworks.filter((f) => f.id !== fw.id);
    }, { separate: true });
    setFwId(frameworks.find((f) => f.id !== fw.id)?.id);
    notify(`Removed ${fw.name}`, { undo: true });
  };
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
        <button className="primary" onClick={() => setAdding(true)}>+ Add state standards</button>
        {adding && <StateStandardsPicker onClose={() => setAdding(false)} onAdded={(id) => { if (id) { setFwId(id); setGrade(''); setQ(''); } }} />}
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
          {hiddenCount > 0 && (
            <button className="link-btn small" onClick={() => { update((d) => { d.hiddenFrameworks = []; }); notify('Sample frameworks restored'); }}>
              Show {hiddenCount} removed sample {hiddenCount === 1 ? 'framework' : 'frameworks'}
            </button>
          )}
          <button className="link-btn small" onClick={() => download('standards-template.csv', toCSVFile([['framework', 'subject', 'code', 'grade', 'description'], ['My District Science', 'Science', 'SCI.6.1', '6', 'Describe…']]), 'text/csv;charset=utf-8')}>CSV template</button>
        </div>
      </aside>
      <section className="detail">
        {!fw && <Empty>No standards yet. Use “+ Add state standards” to add your state’s, or create your own.</Empty>}
        {fw && (
          <>
            <div className="row wrap">
              <input placeholder="Search standards…" value={q} onChange={(e) => setQ(e.target.value)} className="grow" />
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">All grades</option>
                {grades.map((g) => <option key={g} value={g}>{g === 'PK' ? 'Pre-K' : g === 'K' ? 'Kindergarten' : `Grade ${g}`}</option>)}
              </select>
              {fromCatalog && <button disabled={checking} onClick={checkForUpdate}>{checking ? 'Checking…' : 'Check for updates'}</button>}
              <button className="danger" onClick={removeFramework}>Remove</button>
            </div>
            {fromCatalog && (
              <p className="small muted">
                {fw.region} · {fw.subject}{fw.grades ? ` · grades ${fw.grades.join(', ')} only` : ''}{fw.source.updated ? ` · state version of ${formatDate(fw.source.updated, VERSION_DATE)}` : ''}
                <br />{fw.attribution}
              </p>
            )}
            {list.length > LIST_LIMIT && <p className="small muted" role="status">Showing {LIST_LIMIT} of {list.length.toLocaleString()} standards. Search or pick a grade to narrow the list.</p>}
            <table className="table">
              <thead><tr><th>Code</th><th>Grade</th><th>Description</th>{custom && <th />}</tr></thead>
              <tbody>
                {shown.map((s, i) => (
                  <Fragment key={s.id}>
                    {s.group && s.group !== shown[i - 1]?.group && (
                      <tr className="std-group"><th colSpan={custom ? 4 : 3} scope="colgroup">{s.group}</th></tr>
                    )}
                    <tr>
                      <td className="nowrap"><strong>{s.code}</strong>{s.retired && <span className="badge" title="No longer in the state’s current standards">Retired</span>}</td>
                      <td className="nowrap">{s.grade}</td>
                      <td className="pre-line">{s.description}</td>
                      {custom && <td><button className="icon-btn" onClick={() => update((d) => { const f = d.frameworks.find((x) => x.id === fw.id); f.standards = f.standards.filter((x) => x.id !== s.id); })}>✕</button></td>}
                    </tr>
                  </Fragment>
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

  const exportCsv = () => download('standards-coverage.csv', toCSVFile([
    ['Code', 'Description', 'Times taught', 'First', 'Last', 'Classes'],
    ...rows.map((s) => {
      const c = cov[s.id];
      return [s.code, s.description, c?.count || 0, c?.dates[0] || '', c?.dates.at(-1) || '', c ? [...c.classIds].map((id) => visible.find((x) => x.id === id)?.name).join('; ') : ''];
    }),
  ]), 'text/csv;charset=utf-8');

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
