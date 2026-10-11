import { host, useStore } from './lib/store.jsx';
import Welcome from './pages/Welcome.jsx';
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

export default function App() {
  const { state, update, toast, year } = useStore();
  const [route, param] = useHashRoute();
  if (host && !state) return <><Welcome /><Toast toast={toast} /></>;
  if (route === 'view') return <>{<Viewer id={param} />}<Toast toast={toast} /></>;
  const [id, , Page] = PAGES.find(([p]) => p === route) || PAGES[0];
  const me = currentUser(state);

  return (
    <div className="app">
      <header className="topbar no-print">
        <a className="brand" href="#/planner">📘 Teacher Planner</a>
        <nav>
          {PAGES.map(([p, label]) => <a key={p} href={`#/${p}`} className={p === id ? 'on' : ''}>{label}</a>)}
        </nav>
        <div className="who">
          <select value={state.currentYearId} onChange={(e) => update((d) => { d.currentYearId = e.target.value; })} aria-label="School year">
            {state.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select value={me.id} onChange={(e) => update((d) => { d.currentUserId = e.target.value; })} aria-label="Signed in as" title="Signed in as">
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </header>
      <main key={`${id}-${year?.id}-${me.id}`}><Page /></main>
      <Toast toast={toast} />
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">{toast.text}</div>;
}
