import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { demoState, emptyState, currentYear, yearClasses } from './model.js';
import { buildCalendar } from './schedule.js';
import { createHistory, record, undo as undoStep, redo as redoStep } from './history.js';

const KEY = 'teacher-planner:v1';
export const StoreContext = createContext(null);

/** Desktop app bridge (Electron preload); undefined when running in a browser. */
export const host = typeof window !== 'undefined' ? window.plannerHost : undefined;

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    /* fall through to demo data */
  }
  return demoState();
}

/** Fill in any fields added after the data was first saved. */
export function migrate(data) {
  const base = emptyState();
  const out = { ...base, ...data };
  out.library = { ...base.library, ...(data.library || {}) };
  out.integrations = { ...base.integrations, ...(data.integrations || {}) };
  return out;
}

export function StoreProvider({ children }) {
  // In the desktop app state starts empty until the planner folder is read.
  const [state, setState] = useState(() => (host ? null : loadLocal()));
  const [vault, setVault] = useState(null);
  const [toast, setToast] = useState(null);
  const saveTimer = useRef();
  const latest = useRef(state);
  const skipSave = useRef(true);
  const history = useRef(createHistory());
  latest.current = state;

  /** notify(text) · notify(text, true) for errors · notify(text, { undo: true }) to offer Undo */
  const notify = useCallback((text, opts = false) => {
    const o = typeof opts === 'boolean' ? { error: opts } : opts;
    setToast({ text, error: !!o.error, undo: !!o.undo, action: o.action, id: Date.now() });
  }, []);

  // ---- desktop: open the planner folder
  const openVault = useCallback(async (info) => {
    setVault(info);
    if (!info?.vaultPath) return;
    const raw = await host.load();
    skipSave.current = !!raw; // freshly loaded data doesn't need writing back
    history.current = createHistory();
    try {
      setState(raw ? migrate(JSON.parse(raw)) : null);
    } catch {
      setToast({ text: 'planner.json could not be read. Restore a file from the backups folder.', error: true });
    }
  }, []);

  useEffect(() => {
    if (!host) return undefined;
    host.info().then(openVault);
    const off = host.onExternalChange(async () => {
      const raw = await host.load();
      if (!raw) return;
      skipSave.current = true;
      history.current = createHistory();
      setState(migrate(JSON.parse(raw)));
      setToast({ text: 'Planner updated with changes from another computer.' });
    });
    const flush = () => {
      clearTimeout(saveTimer.current);
      if (latest.current && !skipSave.current) host.saveSync(JSON.stringify(latest.current, null, 1));
    };
    window.addEventListener('beforeunload', flush);
    return () => { off(); window.removeEventListener('beforeunload', flush); };
  }, [openVault]);

  // ---- persist
  useEffect(() => {
    if (!state) return undefined;
    if (skipSave.current) { skipSave.current = false; return undefined; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (host) {
          await host.save(JSON.stringify(state, null, 1));
          skipSave.current = false;
        } else {
          localStorage.setItem(KEY, JSON.stringify(state));
        }
      } catch {
        setToast({
          text: host ? 'Could not save to your planner folder. Check that it still exists and isn’t read-only.' : 'Could not save — browser storage is full. Remove large file attachments or export a backup.',
          error: true,
        });
      }
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.undo || toast.action ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /** Apply a mutation to a deep copy of state (undoable). */
  const update = useCallback((fn) => {
    const prev = latest.current;
    const draft = structuredClone(prev);
    fn(draft);
    history.current = record(history.current, prev);
    latest.current = draft;
    setState(draft);
  }, []);

  /** Swap in a whole planner (restore, import, sample data) — also undoable. */
  const replace = useCallback((next) => {
    if (latest.current) history.current = record(history.current, latest.current, Date.now(), true);
    skipSave.current = false;
    latest.current = migrate(next);
    setState(latest.current);
  }, []);

  const undo = useCallback(() => {
    const r = undoStep(history.current, latest.current);
    if (!r) return false;
    history.current = r.history;
    skipSave.current = false;
    latest.current = r.state;
    setState(r.state);
    setToast(null);
    return true;
  }, []);

  const redo = useCallback(() => {
    const r = redoStep(history.current, latest.current);
    if (!r) return false;
    history.current = r.history;
    skipSave.current = false;
    latest.current = r.state;
    setState(r.state);
    return true;
  }, []);

  const year = state ? currentYear(state) : null;
  const classes = useMemo(() => (state ? yearClasses(state, year?.id) : []), [state?.classes, year?.id]);
  const calendar = useMemo(() => (year ? buildCalendar(year, classes) : null), [year, classes]);

  const value = useMemo(
    () => ({ state, update, replace, undo, redo, notify, toast, year, classes, calendar, userId: state?.currentUserId, vault, openVault }),
    [state, update, replace, undo, redo, notify, toast, year, classes, calendar, vault, openVault],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

export function resetToDemo() {
  return demoState();
}
export function resetToEmpty() {
  return emptyState();
}
