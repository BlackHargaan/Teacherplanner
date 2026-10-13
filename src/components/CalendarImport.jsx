import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { uid } from '../lib/model.js';
import { formatDate } from '../lib/dates.js';
import { USES, applyImport, downloadCalendar, importRows, parseICS, schoolYearsIn, termsFromEnds, yearBounds } from '../lib/icsImport.js';
import { Field, Modal } from './ui.jsx';

const NEW_EARLY = '__new__';

/**
 * Import a district calendar (.ics file or calendar link) into the school
 * year. Events are sorted into days off, early release, first/last day and
 * grading periods; the teacher reviews every change before it's made.
 */
export default function CalendarImport({ year, onClose }) {
  const { update, notify } = useStore();
  const [link, setLink] = useState(year.calendarSource?.url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState(null); // { events, url?, fileName? }
  const [schoolYear, setSchoolYear] = useState(null);
  const [rows, setRows] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [setBounds, setSetBounds] = useState(true);
  const [makeTerms, setMakeTerms] = useState(true);
  const existingOff = (year.nonSchoolDays || []).filter((r) => r.kind !== 'cancelled').length;
  const [replaceDaysOff, setReplaceDaysOff] = useState(true);
  const earlyGuess = (year.dayTypes || []).find((t) => /early|half|release/i.test(t.name))?.id || NEW_EARLY;
  const [earlyType, setEarlyType] = useState(earlyGuess);

  const years = useMemo(() => (source ? schoolYearsIn(source.events) : []), [source]);

  const load = (events, meta) => {
    const found = schoolYearsIn(events);
    if (!found.length) {
      setError('No school calendar events (holidays, breaks, first day…) were found in that calendar.');
      return;
    }
    const pick = found.find((y) => year.start >= y.from && year.start <= y.to) || found[0];
    setSource({ events, ...meta });
    chooseYear(events, pick);
  };
  const chooseYear = (events, y) => {
    setSchoolYear(y);
    setRows(importRows(events, y.from, y.to));
  };

  const fromLink = async () => {
    setBusy(true); setError('');
    try {
      const { url, text } = await downloadCalendar(link);
      load(parseICS(text), { url });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const fromFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    file.text().then((text) => {
      if (!/BEGIN:VCALENDAR/.test(text)) { setError('That file isn’t a calendar (.ics) file.'); return; }
      load(parseICS(text), { fileName: file.name });
    });
  };

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const active = rows.filter((r) => r.use !== 'ignore' || r.termEnd);
  const listed = showAll ? rows : rows.filter((r) => r.suggested || r.use !== 'ignore' || r.termEnd);
  const bounds = yearBounds(active);
  // A last day before the first day can't be used (applyImport skips it too).
  const boundsOk = (bounds.last ? bounds.last.end : year.end) >= (bounds.first ? bounds.first.start : year.start);
  const first = boundsOk ? bounds.first : null;
  const last = boundsOk ? bounds.last : null;
  const termEnds = active.filter((r) => r.termEnd || r.use === 'termEnd');
  const previewTerms = termsFromEnds(termEnds, setBounds && first ? first.start : year.start, setBounds && last ? last.end : year.end);
  const hasEarly = active.some((r) => r.use === 'early');
  const useOptions = Object.entries(USES).filter(([k]) => k !== 'rotation' || year.scheduleType === 'cycle');

  const apply = () => {
    let counts;
    update((d) => {
      const y = d.years.find((x) => x.id === year.id);
      let earlyTypeId = earlyType;
      if (hasEarly && earlyType === NEW_EARLY) {
        // Same classes as a regular day until the teacher sets shorter times.
        const fresh = { id: uid('day'), name: 'Early Release', countsInRotation: true, slots: [], periodTimes: {} };
        y.dayTypes = [...(y.dayTypes || []), fresh];
        earlyTypeId = fresh.id;
      }
      counts = applyImport(y, rows, { replaceDaysOff: replaceDaysOff && existingOff > 0, setBounds, makeTerms: makeTerms && previewTerms.length > 0, earlyTypeId: hasEarly ? earlyTypeId : null, makeId: () => uid('term') });
      y.calendarSource = { url: source.url || null, fileName: source.fileName || null, importedAt: new Date().toISOString() };
    }, { separate: true });
    const parts = [
      counts.off && `${counts.off} days off`,
      counts.early && `${counts.early} early release days`,
      counts.terms && `${counts.terms} grading periods`,
      counts.start && `first day ${formatDate(counts.start)}`,
    ].filter(Boolean);
    notify(`Imported ${parts.join(', ') || 'the calendar'}.`, { undo: true });
    onClose();
  };

  return (
    <Modal
      title="Import a district calendar"
      wide
      onClose={onClose}
      footer={source && (
        <>
          <span className="small muted grow">{active.length} of {rows.length} events will be used. Nothing changes until you import.</span>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!active.length} onClick={apply}>Import</button>
        </>
      )}
    >
      {!source && (
        <div className="stack">
          <p className="small">Use your district’s calendar from Google Calendar, Outlook or the district website. The app picks out the first and last day, breaks, workdays, early release days and quarter ends, and shows you everything before it changes your planner.</p>
          <Field label="Calendar link" hint="The calendar’s public iCal / .ics link, or its Google Calendar link.">
            <div className="row">
              <input className="grow" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
              <button className="primary" disabled={!link.trim() || busy} onClick={fromLink}>{busy ? 'Loading…' : 'Load'}</button>
            </div>
          </Field>
          <div className="row small"><span className="muted">or</span>
            <label className="btn">Choose a .ics file…<input type="file" accept=".ics,text/calendar" hidden onChange={fromFile} /></label>
          </div>
          {error && <div className="notice" role="alert">{error}</div>}
        </div>
      )}

      {source && (
        <div className="stack">
          <div className="row wrap">
            <Field label="School year">
              <select value={schoolYear?.startYear} onChange={(e) => chooseYear(source.events, years.find((y) => y.startYear === Number(e.target.value)))}>
                {years.map((y) => <option key={y.startYear} value={y.startYear}>{y.label} ({y.count} school events)</option>)}
              </select>
            </Field>
            {hasEarly && (
              <Field label="Early release days use">
                <select value={earlyType} onChange={(e) => setEarlyType(e.target.value)}>
                  {(year.dayTypes || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  <option value={NEW_EARLY}>A new “Early Release” schedule</option>
                </select>
              </Field>
            )}
          </div>
          {existingOff > 0 && (
            <label className="row small">
              <input type="checkbox" checked={replaceDaysOff} onChange={(e) => setReplaceDaysOff(e.target.checked)} />
              Replace the {existingOff} {existingOff === 1 ? 'break or day off' : 'breaks and days off'}{hasEarly ? ' and early release days' : ''} already in this year (cancelled days stay)
            </label>
          )}
          {(first || last) && (
            <label className="row small">
              <input type="checkbox" checked={setBounds} onChange={(e) => setSetBounds(e.target.checked)} />
              Set the school year to {first ? formatDate(first.start) : formatDate(year.start)} – {last ? formatDate(last.end) : formatDate(year.end)}
              {!last && <span className="muted"> (no last day in this calendar yet)</span>}
            </label>
          )}
          {previewTerms.length > 0 && (
            <label className="row small">
              <input type="checkbox" checked={makeTerms} onChange={(e) => setMakeTerms(e.target.checked)} />
              Set grading periods: {previewTerms.map((t) => `${t.name} (ends ${formatDate(t.end)})`).join(', ')}
              {(year.gradingPeriods || []).length > 0 && <span className="muted"> (replaces your current ones)</span>}
            </label>
          )}

          <div className="table-scroll">
            <table className="table compact import-table">
              <thead><tr><th>Date</th><th>Event</th><th>Use as</th><th>Ends a grading period</th></tr></thead>
              <tbody>
                {listed.map((r) => (
                  <tr key={r.key} className={r.use === 'ignore' && !r.termEnd ? 'muted' : ''}>
                    <td className="nowrap">{formatDate(r.start)}{r.end !== r.start ? ` – ${formatDate(r.end)}` : ''}</td>
                    <td>{r.summary}{r.recurring && <span className="badge">repeats</span>}{!r.allDay && <span className="badge">timed</span>}</td>
                    <td>
                      <select aria-label={`Use “${r.summary}” on ${formatDate(r.start)} as`} value={r.use} onChange={(e) => setRow(r.key, { use: e.target.value })}>
                        {useOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" aria-label={`“${r.summary}” ends a grading period`} checked={r.termEnd || r.use === 'termEnd'} onChange={(e) => setRow(r.key, { termEnd: e.target.checked, use: !e.target.checked && r.use === 'termEnd' ? 'ignore' : r.use })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="row small">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all {rows.length} events (meetings, birthdays and other events are ignored unless you choose a use)
          </label>
          <button className="link-btn small" onClick={() => { setSource(null); setError(''); }}>Use a different calendar</button>
        </div>
      )}
    </Modal>
  );
}
