import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { CATALOG_SOURCE, GRADES, VERSION_DATE, fetchCatalog, fetchFramework, gradeLabel, localId, toLocalFramework } from '../lib/standardsCatalog.js';
import { formatDate } from '../lib/dates.js';
import { Field, Modal } from './ui.jsx';

/** Standards → Add state standards: pick a state, its documents and grades. */
export default function StateStandardsPicker({ onClose, onAdded }) {
  const { state, update, notify } = useStore();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const owned = useMemo(() => new Set((state.frameworks || []).filter((f) => f.source?.catalog === CATALOG_SOURCE).map((f) => f.source.id)), [state.frameworks]);
  const lastRegion = [...(state.frameworks || [])].reverse().find((f) => f.source?.catalog === CATALOG_SOURCE)?.region || '';
  const [region, setRegion] = useState(lastRegion);
  const [picked, setPicked] = useState(() => new Set());
  const [grades, setGrades] = useState(() => new Set());
  const [showOlder, setShowOlder] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError('');
    fetchCatalog().then(setCatalog, (err) => setError(err.message));
  };
  useEffect(load, []);

  const regions = useMemo(() => [...new Set((catalog?.frameworks || []).map((f) => f.jurisdiction))].filter((r) => r !== 'Multi-State'), [catalog]);
  const list = (catalog?.frameworks || []).filter((f) => f.jurisdiction === region && (showOlder || f.current));
  const chosen = list.filter((f) => picked.has(f.id));
  const gradeChoices = GRADES.filter((g) => (chosen.length ? chosen : list).some((f) => f.grades.includes(g)));

  const toggle = (set, setter, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const add = async () => {
    setBusy(true);
    try {
      const gradeList = [...grades];
      const downloaded = await Promise.all(chosen.map((f) => fetchFramework(f.id)));
      const frameworks = downloaded.map((data) => toLocalFramework(data, gradeList));
      update((d) => {
        for (const fw of frameworks) {
          d.frameworks = d.frameworks.filter((f) => f.id !== fw.id);
          d.frameworks.push(fw);
        }
      });
      const total = frameworks.reduce((n, f) => n + f.standards.length, 0);
      notify(`Added ${total.toLocaleString()} ${region} standards`);
      onAdded?.(frameworks[0]?.id);
      onClose();
    } catch (err) {
      notify(err.message, true);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add state standards"
      wide
      onClose={onClose}
      footer={(
        <>
          <span className="small muted grow">Downloads once, then works offline.</span>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!chosen.length || busy} onClick={add}>
            {busy ? 'Adding…' : chosen.length > 1 ? `Add ${chosen.length} sets of standards` : 'Add standards'}
          </button>
        </>
      )}
    >
      {error && (
        <div className="notice" role="alert">
          {error} <button className="link-btn" onClick={load}>Try again</button>
        </div>
      )}
      {!catalog && !error && <p className="small muted" role="status">Loading the standards library…</p>}
      {catalog && (
        <div className="stack">
          <Field label="State">
            <select value={region} onChange={(e) => { setRegion(e.target.value); setPicked(new Set()); setGrades(new Set()); }}>
              <option value="">Choose your state…</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          {region && (
            <fieldset className="plain-fieldset">
              <legend className="field-label">Standards</legend>
              <ul className="list std-catalog">
                {list.map((f) => {
                  const added = owned.has(f.id) || state.frameworks.some((x) => x.id === localId(f.id));
                  return (
                    <li key={f.id}>
                      <label className="row grow">
                        <input type="checkbox" disabled={added} checked={added || picked.has(f.id)} onChange={() => toggle(picked, setPicked, f.id)} />
                        <span className="grow">
                          <strong>{f.subject}</strong> · {f.name}
                          {!f.current && <span className="badge">Older version</span>}
                          <br />
                          <span className="small muted">
                            {f.count.toLocaleString()} standards · grades {gradeLabel(f.grades)}{f.updated ? ` · updated ${formatDate(f.updated, VERSION_DATE)}` : ''}
                          </span>
                        </span>
                        {added && <span className="badge">Added</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!list.length && <p className="small muted">No standards found for {region}.</p>}
              <label className="row small"><input type="checkbox" checked={showOlder} onChange={(e) => setShowOlder(e.target.checked)} /> Show older versions</label>
            </fieldset>
          )}

          {region && gradeChoices.length > 1 && (
            <fieldset className="plain-fieldset">
              <legend className="field-label">Grades you teach</legend>
              <div className="chips" role="group">
                {gradeChoices.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`chip chip-click ${grades.has(g) ? 'chip-active' : ''}`}
                    aria-pressed={grades.has(g)}
                    onClick={() => toggle(grades, setGrades, g)}
                  >
                    {g === 'PK' ? 'Pre-K' : g === 'K' ? 'K' : `Grade ${g}`}
                  </button>
                ))}
              </div>
              <span className="field-hint">{grades.size ? 'Only these grades will be added.' : 'Leave all unselected to add every grade.'}</span>
            </fieldset>
          )}

          <p className="small muted">
            Official state standards from the{' '}
            <a href={catalog.source?.url} target="_blank" rel="noreferrer">Learning Commons Knowledge Graph</a>, shared under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Each set credits the state agency that wrote it.
          </p>
        </div>
      )}
    </Modal>
  );
}
