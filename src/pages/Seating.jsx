import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { canEdit, canView, uid } from '../lib/model.js';
import { Empty, Field } from '../components/ui.jsx';
import { gridSize, pruneSeats, seatedIds, seatsOutsideGrid } from '../lib/seating.js';

function newChart(name = 'Main layout') {
  return { id: uid('seat'), name, rows: 5, cols: 6, disabled: [], seats: {} };
}

export default function Seating() {
  const { classes, userId, update } = useStore();
  const visible = classes.filter((c) => canView(c, userId));
  const [classId, setClassId] = useState(visible[0]?.id);
  const cls = visible.find((c) => c.id === classId);
  const charts = cls?.seatingCharts || [];
  const [chartId, setChartId] = useState(null);
  const chart = charts.find((c) => c.id === chartId) || charts[0];
  const [layoutMode, setLayoutMode] = useState(false);
  const [dragging, setDragging] = useState(null);
  if (!cls) return <div className="page"><Empty>Create a class first.</Empty></div>;
  const editable = canEdit(cls, userId);
  const editChart = (fn) => update((d) => fn(d.classes.find((c) => c.id === cls.id).seatingCharts.find((x) => x.id === chart.id)));
  const addChart = () => {
    const c = newChart(charts.length ? `Layout ${charts.length + 1}` : 'Main layout');
    update((d) => { const cc = d.classes.find((x) => x.id === cls.id); cc.seatingCharts = [...(cc.seatingCharts || []), c]; });
    setChartId(c.id);
  };
  if (!chart) {
    return (
      <div className="page">
        <div className="page-head"><h1>Seating Charts</h1><ClassSelect /></div>
        <Empty>No seating chart for {cls.name}. {editable && <button className="primary" onClick={addChart}>Create one</button>}</Empty>
      </div>
    );
  }

  const seated = seatedIds(chart);
  const unseated = cls.students.filter((s) => !seated.has(s.id));
  const student = (id) => cls.students.find((s) => s.id === id);
  const dropOn = (key) => {
    if (!dragging || !editable) return;
    editChart((c) => {
      const occupant = c.seats[key];
      // a student only ever sits in one place
      for (const [k, id] of Object.entries(c.seats)) if (id === dragging.studentId && k !== dragging.from) delete c.seats[k];
      if (dragging.from) {
        if (occupant) c.seats[dragging.from] = occupant; else delete c.seats[dragging.from];
      }
      c.seats[key] = dragging.studentId;
    });
    setDragging(null);
  };
  // Lowering Rows or Columns unseats anyone left outside the grid (once the box is left, so typing "12" doesn't pass through 1).
  const unseatOutside = () => { if (seatsOutsideGrid(chart).length) editChart(pruneSeats); };
  const unseat = () => {
    if (dragging?.from) editChart((c) => { delete c.seats[dragging.from]; });
    setDragging(null);
  };
  const shuffle = () => editChart((c) => {
    const open = [];
    for (let r = 0; r < c.rows; r += 1) for (let col = 0; col < c.cols; col += 1) if (!c.disabled.includes(`${r}-${col}`)) open.push(`${r}-${col}`);
    const ids = cls.students.map((s) => s.id).sort(() => Math.random() - 0.5);
    c.seats = {};
    ids.slice(0, open.length).forEach((id, i) => { c.seats[open[i]] = id; });
  });
  const alpha = () => editChart((c) => {
    const open = [];
    for (let r = 0; r < c.rows; r += 1) for (let col = 0; col < c.cols; col += 1) if (!c.disabled.includes(`${r}-${col}`)) open.push(`${r}-${col}`);
    const ids = [...cls.students].sort((a, b) => a.last.localeCompare(b.last)).map((s) => s.id);
    c.seats = {};
    ids.slice(0, open.length).forEach((id, i) => { c.seats[open[i]] = id; });
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Seating Charts</h1>
        <div className="row wrap no-print">
          <ClassSelect />
          <select value={chart.id} onChange={(e) => setChartId(e.target.value)}>{charts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {editable && <button onClick={addChart}>+ Layout</button>}
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {editable && (
        <div className="card row wrap no-print" data-tour="seat-layout">
          <Field label="Name" inline><input value={chart.name} onChange={(e) => editChart((c) => { c.name = e.target.value; })} /></Field>
          <Field label="Rows" inline><input type="number" className="mini" min="1" max="15" value={chart.rows} onChange={(e) => { const n = gridSize(e.target.value); if (n) editChart((c) => { c.rows = n; }); }} onBlur={unseatOutside} /></Field>
          <Field label="Columns" inline><input type="number" className="mini" min="1" max="15" value={chart.cols} onChange={(e) => { const n = gridSize(e.target.value); if (n) editChart((c) => { c.cols = n; }); }} onBlur={unseatOutside} /></Field>
          <label className="row small"><input type="checkbox" checked={layoutMode} onChange={(e) => setLayoutMode(e.target.checked)} /> Edit layout (click cells to add/remove desks)</label>
          <button onClick={shuffle}>Random</button>
          <button onClick={alpha}>Alphabetical</button>
          <button onClick={() => editChart((c) => { c.seats = {}; })}>Clear</button>
          <button className="danger" onClick={() => { if (window.confirm('Delete this layout?')) { update((d) => { const cc = d.classes.find((x) => x.id === cls.id); cc.seatingCharts = cc.seatingCharts.filter((x) => x.id !== chart.id); }); setChartId(null); } }}>Delete layout</button>
        </div>
      )}
      <div className="seating">
        <div>
          <div className="front">Front of room</div>
          <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${chart.cols}, 1fr)` }}>
            {Array.from({ length: chart.rows * chart.cols }, (_, i) => {
              const key = `${Math.floor(i / chart.cols)}-${i % chart.cols}`;
              const off = chart.disabled.includes(key);
              const s = student(chart.seats[key]);
              if (layoutMode) {
                return (
                  <button key={key} className={`seat ${off ? 'seat-off' : ''}`} onClick={() => editChart((c) => {
                    c.disabled = off ? c.disabled.filter((x) => x !== key) : [...c.disabled, key];
                    if (!off) delete c.seats[key];
                  })}>{off ? '' : 'desk'}</button>
                );
              }
              if (off) return <div key={key} className="seat seat-off" />;
              return (
                <div
                  key={key}
                  className={`seat ${s ? 'seat-taken' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(key)}
                  draggable={!!s && editable}
                  onDragStart={() => s && setDragging({ studentId: s.id, from: key })}
                  title={s?.notes}
                >
                  {s ? <><strong>{s.first}</strong><span>{s.last}</span>{s.notes && <span className="seat-flag">•</span>}</> : ''}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="unseated no-print" onDragOver={(e) => e.preventDefault()} onDrop={unseat}>
          <h3>Unseated ({unseated.length})</h3>
          {unseated.map((s) => (
            <div key={s.id} className="student-pill" draggable={editable} onDragStart={() => setDragging({ studentId: s.id })}>{s.first} {s.last}</div>
          ))}
          <p className="small muted">Drag students onto desks. Drag a seated student here to unseat, or onto another student to swap.</p>
        </aside>
      </div>
    </div>
  );

  function ClassSelect() {
    return <select value={classId} onChange={(e) => { setClassId(e.target.value); setChartId(null); }}>{visible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
  }
}
