import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayOfWeek, today } from '../lib/dates.js';
import { dayKeyLabel, gradingPeriodFor, schoolDays } from '../lib/schedule.js';
import { datesBetween, defaultLabel, offDayMap, paintDates } from '../lib/calendarPaint.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthsOf(start, end) {
  const out = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7)) - 1;
  const endKey = end.slice(0, 7);
  for (let i = 0; i < 24; i += 1) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    out.push({ y, m, key });
    if (key >= endKey) break;
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return out;
}

const shortKey = (key, year) => {
  const label = dayKeyLabel(key, year);
  return key?.[0] === 'C' ? label.replace(' Day', '').replace('Day ', '') : '';
};

/**
 * The whole school year on one screen. Pick a brush, then click a day or
 * drag across several to mark breaks, workdays, cancelled days, alternate
 * schedules and (for rotating schedules) which day of the rotation a date is.
 */
export default function YearCalendar({ year, editYear }) {
  const isCycle = year.scheduleType === 'cycle';
  const brushes = useMemo(() => [
    { id: 'school', label: 'School day', brush: { kind: 'school' } },
    { id: 'holiday', label: 'No school', brush: { kind: 'holiday' }, named: true },
    { id: 'workday', label: 'Teacher workday', brush: { kind: 'workday' }, named: true },
    { id: 'cancelled', label: 'Cancelled (snow day…)', brush: { kind: 'cancelled' }, named: true },
    ...(year.dayTypes || []).map((t) => ({ id: `type-${t.id}`, label: t.name, brush: { kind: 'dayType', id: t.id } })),
    ...(isCycle ? Array.from({ length: year.cycleLength || 6 }, (_, i) => ({ id: `rot-${i + 1}`, label: `Is ${dayKeyLabel(`C${i + 1}`, year)}`, brush: { kind: 'rotation', key: `C${i + 1}` }, rotation: true })) : []),
    ...(isCycle ? [{ id: 'clearRot', label: 'Clear day mark', brush: { kind: 'clearRotation' }, rotation: true }] : []),
  ], [year, isCycle]);
  const [brushId, setBrushId] = useState('holiday');
  const active = brushes.find((b) => b.id === brushId) || brushes[0];
  const [label, setLabel] = useState('');
  const [anchor, setAnchor] = useState(null);
  const [hover, setHover] = useState(null);
  const dragging = useRef(false);

  const days = useMemo(() => Object.fromEntries(schoolDays(year).map((d) => [d.date, d])), [year]);
  const off = useMemo(() => offDayMap(year), [year]);
  const types = useMemo(() => Object.fromEntries((year.dayTypes || []).map((t) => [t.id, t])), [year.dayTypes]);
  const weekdays = new Set(year.weekdays || [1, 2, 3, 4, 5]);
  const selecting = anchor && hover ? new Set(datesBetween(anchor, hover)) : null;
  const now = today();

  const paint = (dates) => {
    const inYear = dates.filter((d) => d >= year.start && d <= year.end);
    if (!inYear.length) return;
    editYear((y) => paintDates(y, inYear, active.named ? { ...active.brush, label: label.trim() || defaultLabel(active.brush.kind) } : active.brush));
  };

  useEffect(() => {
    const finish = () => {
      if (dragging.current && anchor && hover) paint(datesBetween(anchor, hover));
      dragging.current = false;
      setAnchor(null);
      setHover(null);
    };
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  });

  const dateAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-date]')?.dataset.date;

  return (
    <div className="yearcal">
      <div className="yearcal-tools" role="toolbar" aria-label="Paint days">
        {brushes.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`brush brush-${b.brush.kind} ${b.id === active.id ? 'on' : ''}`}
            aria-pressed={b.id === active.id}
            onClick={() => { if (b.id !== active.id) setLabel(''); setBrushId(b.id); }}
          >
            <span className="swatch" aria-hidden="true" />{b.label}
          </button>
        ))}
        {active.named && (
          <input
            className="brush-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Name, e.g. ${active.brush.kind === 'holiday' ? 'Winter break' : active.brush.kind === 'cancelled' ? 'Snow day' : 'Teacher workday'}`}
            aria-label="Name for these days"
          />
        )}
      </div>
      <p className="small muted">Click a day, or drag across several, to mark them as <strong>{active.label.toLowerCase()}</strong>.</p>

      <div
        className="yearcal-months"
        onPointerMove={(e) => { if (dragging.current) { const d = dateAt(e); if (d && d !== hover) setHover(d); } }}
      >
        {monthsOf(year.start, year.end).map(({ y, m, key }) => {
          const first = `${key}-01`;
          const lead = dayOfWeek(first);
          const cells = [];
          for (let i = 0; i < lead; i += 1) cells.push(<span key={`pad-${i}`} className="cal-pad" />);
          for (let d = first; d.slice(0, 7) === key; d = addDays(d, 1)) {
            const inYear = d >= year.start && d <= year.end;
            const offDay = off.get(d);
            const day = days[d];
            const type = day?.dayType || (year.dayAssignments?.[d] && types[year.dayAssignments[d]]);
            const marked = year.rotationOverrides?.[d];
            const kind = !inYear ? 'outside' : !weekdays.has(dayOfWeek(d)) ? 'weekend' : offDay ? offDay.kind : type ? 'dayType' : 'school';
            const term = gradingPeriodFor(year, d);
            const title = [
              offDay?.label || (type ? type.name : kind === 'school' ? 'School day' : ''),
              day && isCycle ? dayKeyLabel(day.dayKey, year) : '',
              marked ? `(marked ${dayKeyLabel(marked, year)})` : '',
              term ? term.name : '',
            ].filter(Boolean).join(' · ');
            cells.push(
              <button
                key={d}
                type="button"
                data-date={d}
                className={`cal-day cal-${kind} ${selecting?.has(d) ? 'cal-selecting' : ''} ${d === now ? 'cal-today' : ''} ${marked ? 'cal-marked' : ''}`}
                disabled={!inYear}
                title={title}
                aria-label={`${MONTHS[m]} ${Number(d.slice(8))}${title ? `, ${title}` : ''}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  dragging.current = true;
                  setAnchor(d);
                  setHover(d);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); paint([d]); } }}
              >
                <span className="cal-num">{Number(d.slice(8))}</span>
                {day && isCycle && <span className="cal-rot">{shortKey(day.dayKey, year)}</span>}
              </button>,
            );
          }
          return (
            <section key={key} className="cal-month" aria-label={`${MONTHS[m]} ${y}`}>
              <h3>{MONTHS[m]} <span className="muted">{y}</span></h3>
              <div className="cal-grid">
                {DOW.map((n, i) => <span key={`h${i}`} className="cal-dow" aria-hidden="true">{n}</span>)}
                {cells}
              </div>
            </section>
          );
        })}
      </div>

      <ul className="yearcal-legend small" aria-label="Legend">
        <li><span className="swatch sw-school" />School day</li>
        <li><span className="swatch sw-holiday" />No school</li>
        <li><span className="swatch sw-workday" />Teacher workday</li>
        <li><span className="swatch sw-cancelled" />Cancelled</li>
        <li><span className="swatch sw-dayType" />Alternate schedule</li>
        {isCycle && <li><span className="cal-marked-sample">1</span>Rotation day set by hand</li>}
      </ul>
    </div>
  );
}
