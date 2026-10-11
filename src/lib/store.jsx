import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { demoState, emptyState, currentYear, yearClasses } from './model.js';
import { buildCalendar } from './schedule.js';

const KEY = 'teacher-planner:v1';
export const StoreContext = createContext(null);

function load() {
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
  const [state, setState] = useState(load);
  const [toast, setToast] = useState(null);
  const saveTimer = useRef();

  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        setToast({ text: 'Could not save — browser storage is full. Remove large file attachments or export a backup.', error: true });
      }
    }, 250);
  }, [state]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /** Apply a mutation to a deep copy of state. */
  const update = useCallback((fn) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const replace = useCallback((next) => setState(migrate(next)), []);
  const notify = useCallback((text, error = false) => setToast({ text, error }), []);

  const year = currentYear(state);
  const classes = useMemo(() => yearClasses(state, year?.id), [state.classes, year?.id]);
  const calendar = useMemo(() => buildCalendar(year, classes), [year, classes]);

  const value = useMemo(
    () => ({ state, update, replace, notify, toast, year, classes, calendar, userId: state.currentUserId }),
    [state, update, replace, notify, toast, year, classes, calendar],
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
