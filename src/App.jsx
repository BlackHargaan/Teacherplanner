import { useEffect, useState } from 'react';
import { host, useStore } from './lib/store.jsx';
import { applyAppearance } from './data/themes.js';
import Welcome from './pages/Welcome.jsx';
import { UpdateBanner } from './components/Updates.jsx';
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
  const { state, update, undo, redo, notify, toast, year } = useStore();
  const [route, param] = useHashRoute();
  const appearance = state ? currentUser(state)?.appearance : undefined;
  useEffect(() => { applyAppearance(appearance); }, [appearance?.palette, appearance?.mode]);
  // Desktop menu items (e.g. Help → Check for Updates…) can open a page.
  useEffect(() => host?.onNavigate?.((path) => { window.location.hash = `#/${path}`; }), []);

  // Undo / redo / find. The desktop app routes these through its Edit menu;
  // in a browser we listen for the keys directly.
  useEffect(() => {
    const run = (cmd) => {
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
  }, [undo, redo, notify]);

  if (host && !state) return <><Welcome /><Toast toast={toast} /></>;
  if (route === 'view') return <>{<Viewer id={param} />}<Toast toast={toast} /></>;
  if (route === 'print') return <><PrintPage /><Toast toast={toast} /></>;
  const [id, , Page] = route === 'search' ? ['search', 'Search', Search] : PAGES.find(([p]) => p === route) || PAGES[0];
  const me = currentUser(state);

  return (
    <div className="app">
      <header className="topbar no-print">
        <a className="brand" href="#/planner">📘 Teacher Planner</a>
        <nav>
          {PAGES.map(([p, label]) => <a key={p} href={`#/${p}`} className={p === id ? 'on' : ''}>{label}</a>)}
        </nav>
        <SearchBox initial={route === 'search' ? decodeURIComponent(param || '') : ''} />
        <div className="who">
          <select value={state.currentYearId} onChange={(e) => update((d) => { d.currentYearId = e.target.value; })} aria-label="School year">
            {state.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select value={me.id} onChange={(e) => update((d) => { d.currentUserId = e.target.value; })} aria-label="Signed in as" title="Signed in as">
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </header>
      <UpdateBanner />
      <main key={`${id}-${year?.id}-${me.id}`}><Page /></main>
      <Toast toast={toast} />
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
