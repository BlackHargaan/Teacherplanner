import { useEffect, useState } from 'react';
import { host, useStore } from './lib/store.jsx';
import { applyAppearance } from './data/themes.js';
import Welcome from './pages/Welcome.jsx';
import LoadError from './pages/LoadError.jsx';
import { UpdateBanner } from './components/Updates.jsx';
import { CloudStatus } from './components/CloudAccount.jsx';
import { useHashRoute } from './lib/router.js';
import { currentUser } from './lib/model.js';
import Planner from './pages/Planner.jsx';
import Setup from './pages/Setup.jsx';
import Classes from './pages/Classes.jsx';
import Templates from './pages/Templates.jsx';
import Collaborate from './pages/Collaborate.jsx';
import Standards from './pages/Standards.jsx';
import Views, { Viewer } from './pages/Views.jsx';
import Gradebook from './pages/Gradebook.jsx';
import Seating from './pages/Seating.jsx';
import Integrations from './pages/Integrations.jsx';
import Settings from './pages/Settings.jsx';
import Search from './pages/Search.jsx';
import PrintPage from './pages/Print.jsx';
import { navigate } from './lib/router.js';
import { useTour } from './components/Tour.jsx';
import { Menu } from './components/ui.jsx';
import { TOURS } from './lib/tours.js';
import { yearProgress } from './lib/yearProgress.js';
import { formatDate, today } from './lib/dates.js';

const PAGES = [
  ['planner', 'Planner', Planner],
  ['setup', 'Schedule', Setup],
  ['classes', 'Classes', Classes],
  ['templates', 'Templates', Templates],
  ['collaborate', 'Collaborate', Collaborate],
  ['standards', 'Standards', Standards],
  ['views', 'Shared Views', Views],
  ['gradebook', 'Gradebook', Gradebook],
  ['seating', 'Seating', Seating],
  ['google', 'Google', Integrations],
  ['settings', 'Settings', Settings],
];

/** True when keyboard focus is in a text field (where Ctrl+Z means "undo typing"). */
function editingText() {
  const el = document.activeElement;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export default function App() {
  const { state, update, undo, redo, notify, toast, year, loadError } = useStore();
  const [route, param] = useHashRoute();
  const tour = useTour();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [route, param]); // close the menu after picking a page
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); document.querySelector('.nav-toggle')?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const appearance = state ? currentUser(state)?.appearance : undefined;
  useEffect(() => { applyAppearance(appearance); }, [appearance?.palette, appearance?.mode]);
  // Desktop menu items (e.g. Help → Check for Updates…) can open a page.
  useEffect(() => host?.onNavigate?.((path) => { window.location.hash = `#/${path}`; }), []);

  // Undo / redo / find. The desktop app routes these through its Edit menu;
  // in a browser we listen for the keys directly.
  useEffect(() => {
    const run = (cmd) => {
      if (cmd === 'tour') { tour.start('start'); return; }
      if (cmd === 'find') {
        const box = document.getElementById('global-search');
        if (box) { box.focus(); box.select(); } else navigate('search');
        return;
      }
      if (editingText()) { document.execCommand(cmd); return; }
      const done = cmd === 'undo' ? undo() : redo();
      if (done && cmd === 'redo') notify('Redone');
    };
    const offMenu = host?.onCommand?.(run);
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') { e.preventDefault(); run('find'); return; }
      if (key === '/' && !mod && !editingText()) { e.preventDefault(); run('find'); return; }
      if (host || !mod || editingText()) return;
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); run('undo'); }
      if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); run('redo'); }
    };
    window.addEventListener('keydown', onKey);
    return () => { offMenu?.(); window.removeEventListener('keydown', onKey); };
  }, [undo, redo, notify, tour.start]);

  if (host && loadError) return <><LoadError /><Toast toast={toast} /></>;
  if (host && !state) return <><Welcome /><Toast toast={toast} /></>;
  if (route === 'view') return <>{<Viewer id={param} />}<Toast toast={toast} /></>;
  if (route === 'print') return <><PrintPage /><Toast toast={toast} /></>;
  const [id, , Page] = route === 'search' ? ['search', 'Search', Search] : PAGES.find(([p]) => p === route) || PAGES[0];
  const me = currentUser(state);

  const sidebarNav = (
    <nav id="main-nav" aria-label="Pages">
      {PAGES.map(([p, label]) => <a key={p} href={`#/${p}`} className={p === id ? 'on' : ''} aria-current={p === id ? 'page' : undefined}>{label}</a>)}
    </nav>
  );

  return (
    <div className="app">
      <aside className={`sidebar no-print ${menuOpen ? 'open' : ''}`} aria-label="Teacher Planner">
        <a className="brand" href="#/planner">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="var(--accent)" /><path d="M6.5 11.5l3 3 6-7" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Teacher Planner
        </a>
        {sidebarNav}
        <YearCard />
      </aside>
      {menuOpen && <div className="sidebar-backdrop no-print" onClick={() => setMenuOpen(false)} />}
      <div className="main-col">
        <header className="topbar no-print">
          {/* On narrow windows the sidebar folds away behind this button. */}
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true">☰</span> {PAGES.find(([p]) => p === id)?.[1] || 'Menu'}
          </button>
          <div className="grow" />
          <SearchBox initial={route === 'search' ? decodeURIComponent(param || '') : ''} />
          <CloudStatus />
          <Menu
            className="help-menu"
            label="?"
            title="Help and tours"
            items={[
              tour.pageTour && { label: `Tour this page (${TOURS[tour.pageTour].title})`, onClick: () => tour.start(tour.pageTour) },
              { label: 'Getting started tour', onClick: () => tour.start('start') },
              '-',
              { label: 'Tour settings…', onClick: () => navigate('settings/tours') },
            ]}
          />
          {state.users.length > 1 && (
            <select className="who" value={me.id} onChange={(e) => update((d) => { d.currentUserId = e.target.value; })} aria-label="Signed in as" title="Signed in as">
              {state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </header>
        <UpdateBanner />
        <main key={`${id}-${year?.id}-${me.id}`}><Page /></main>
      </div>
      <Toast toast={toast} />
    </div>
  );
}

/** Sidebar card: which school year is open, and how far into it today is. */
function YearCard() {
  const { state, update, year, calendar } = useStore();
  const p = year && calendar ? yearProgress(year, calendar.days, today()) : null;
  return (
    <div className="year-card">
      <select value={state.currentYearId} onChange={(e) => update((d) => { d.currentYearId = e.target.value; })} aria-label="School year">
        {state.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
      </select>
      {p && p.total > 0 && (
        <>
          <div className="year-meter" role="progressbar" aria-label="School year so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}><div style={{ width: `${p.percent}%` }} /></div>
          <div className="small muted">
            {p.stage === 'before' && `Starts ${formatDate(p.starts, { month: 'short', day: 'numeric' })} · ${p.total} school days`}
            {p.stage === 'during' && `Day ${p.day} of ${p.total}${p.term ? ` · ${p.term}` : ''}`}
            {p.stage === 'after' && `Finished · ${p.total} school days`}
          </div>
        </>
      )}
    </div>
  );
}

function SearchBox({ initial }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  return (
    <form className="global-search" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`search/${encodeURIComponent(q.trim())}`); }}>
      <input
        id="global-search"
        type="search"
        placeholder="Search lessons…"
        aria-label="Search lessons"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          // results update as you type once you're on the search page
          if (window.location.hash.startsWith('#/search')) window.location.replace(`#/search/${encodeURIComponent(e.target.value)}`);
        }}
      />
    </form>
  );
}

function Toast({ toast }) {
  const { undo } = useStore();
  if (!toast) return null;
  return (
    <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">
      {toast.text}
      {toast.undo && <button className="toast-action" onClick={undo}>Undo</button>}
      {toast.action && <button className="toast-action" onClick={toast.action.run}>{toast.action.label}</button>}
    </div>
  );
}
