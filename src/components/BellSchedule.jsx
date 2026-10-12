import { useStore } from '../lib/store.jsx';
import { yearClasses } from '../lib/model.js';
import { dayKeyLabel, dayKeysFor } from '../lib/schedule.js';
import { assignPeriod, classInPeriod, editPeriod, nextPeriod, removePeriod } from '../lib/bells.js';
import { formatTime } from '../lib/dates.js';

/**
 * The school's bell schedule (entered once), and a grid to put each class in
 * its period. Class meeting times follow the bell, so a time change here
 * moves every class in that period.
 */
export default function BellSchedule({ year }) {
  const { state, update } = useStore();
  const classes = yearClasses(state, year.id);
  const periods = year.periods || [];
  const keys = dayKeysFor(year);
  const edit = (fn) => update((d) => fn(d));

  return (
    <div className="stack">
      <table className="table compact bells">
        <thead><tr><th>Period</th><th>Starts</th><th>Ends</th><th><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id}>
              <td><input value={p.name} aria-label="Period name" onChange={(e) => edit((d) => editPeriod(d, year.id, p.id, { name: e.target.value }))} /></td>
              <td><input type="time" value={p.start} aria-label={`${p.name} starts`} onChange={(e) => edit((d) => editPeriod(d, year.id, p.id, { start: e.target.value }))} /></td>
              <td><input type="time" value={p.end} aria-label={`${p.name} ends`} onChange={(e) => edit((d) => editPeriod(d, year.id, p.id, { end: e.target.value }))} /></td>
              <td>
                <button className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => {
                  if (window.confirm(`Remove “${p.name}”? Classes in it keep their times.`)) edit((d) => removePeriod(d, year.id, p.id));
                }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button onClick={() => edit((d) => { const y = d.years.find((x) => x.id === year.id); y.periods = [...(y.periods || []), nextPeriod(y.periods || [])]; })}>+ Add period</button>
        <span className="small muted">Include lunch or your planning period if you like; leave them empty below.</span>
      </div>

      {periods.length > 0 && classes.length > 0 && (
        <>
          <h3>Which class meets when</h3>
          <div className="table-scroll">
            <table className="table compact bell-grid">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  {keys.length > 1 && <th scope="col">Every day</th>}
                  {keys.map((k) => <th key={k} scope="col">{dayKeyLabel(k, year)}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const perDay = keys.map((k) => classInPeriod(classes, k, p.id)?.id || '');
                  const same = perDay.every((id) => id === perDay[0]) ? perDay[0] : 'mixed';
                  const pick = (dayKeys, label, value) => (
                    <select
                      aria-label={`${p.name}, ${label}`}
                      value={value}
                      onChange={(e) => e.target.value !== 'mixed' && edit((d) => assignPeriod(d, year.id, dayKeys, p.id, e.target.value || null))}
                      style={value && value !== 'mixed' ? { '--chip': classes.find((c) => c.id === value)?.color } : undefined}
                      className={value && value !== 'mixed' ? 'class-pick' : ''}
                    >
                      {value === 'mixed' && <option value="mixed">Varies</option>}
                      <option value="">—</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  );
                  return (
                    <tr key={p.id}>
                      <th scope="row">{p.name}<br /><span className="small muted">{formatTime(p.start)}–{formatTime(p.end)}</span></th>
                      {keys.length > 1 && <td>{pick(keys, 'every day', same)}</td>}
                      {keys.map((k, i) => <td key={k}>{pick([k], dayKeyLabel(k, year), perDay[i])}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Choosing a class here sets its meeting times on the Classes page too. A class meets once a day, so picking it again on the same day moves it.</p>
        </>
      )}
      {periods.length > 0 && classes.length === 0 && <p className="small muted">Add your classes on the <a href="#/classes">Classes</a> page, then put them in periods here.</p>}
    </div>
  );
}
