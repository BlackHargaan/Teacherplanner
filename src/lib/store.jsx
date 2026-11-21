import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cloneState, currentUser, demoState, emptyState, currentYear, yearClasses } from './model.js';
import { buildCalendar } from './schedule.js';
import { applyToHistory, createHistory, record, undo as undoStep, redo as redoStep } from './history.js';
import { keepStorage, loadPlanner, onOtherTabSave, savePlanner } from './browserStorage.js';

export const StoreContext = createContext(null);

/** Desktop app bridge (Electron preload); undefined when running in a browser. */
export const host = typeof window !== 'undefined' ? window.plannerHost : undefined;

/**
 * Browser: the saved planner; an empty one on a first visit (sample data is
 * under Settings → Data); null when it can't be read.
 */
async function loadBrowser({ firstLoad }) {
  try {
    const raw = await loadPlanner();
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    return firstLoad ? emptyState() : null;
  }
  return firstLoad ? emptyState() : null;
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
  // State starts empty until the planner folder (desktop) or browser storage is read.
  const [state, setState] = useState(null);
  const [vault, setVault] = useState(null);
  // Desktop: planner.json exists but isn't valid (damaged, or half-synced). Nothing is saved until the teacher decides.
  const [loadError, setLoadError] = useState(null);
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
    setLoadError(null);
    if (!info?.vaultPath) return;
    const raw = await host.load();
    skipSave.current = !!raw; // freshly loaded data doesn't need writing back
    history.current = createHistory();
    let next = null;
    try {
      next = raw ? migrate(JSON.parse(raw)) : null;
    } catch (err) {
      // Never fall through to the "start a new planner" screen: that would save over the file.
      skipSave.current = true;
      latest.current = null;
      setState(null);
      setLoadError({ message: err?.message || 'Invalid file' });
      return;
    }
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!host) return undefined;
    host.info().then(openVault);
    const off = host.onExternalChange(async () => {
      const raw = await host.load();
      if (!raw) return;
      let next;
      try {
        next = migrate(JSON.parse(raw));
      } catch {
        return; // half-synced or damaged copy: keep what's on screen (it's saved again with the next change)
      }
      skipSave.current = true;
      history.current = createHistory();
      latest.current = next;
      setState(next);
      setLoadError(null);
      setToast({ text: 'Planner updated with changes from another computer.' });
    });
    const flush = () => {
      clearTimeout(saveTimer.current);
      if (latest.current && !skipSave.current) host.saveSync(JSON.stringify(latest.current, null, 1));
    };
    window.addEventListener('beforeunload', flush);
    return () => { off(); window.removeEventListener('beforeunload', flush); };
  }, [openVault]);

  // ---- browser: load, then follow saves made in other tabs (or an "Open view" tab)
  useEffect(() => {
    if (host) return undefined;
    let live = true;
    const load = async (fromOtherTab) => {
      const next = await loadBrowser({ firstLoad: !fromOtherTab });
      if (!live || !next) return; // another tab's copy that can't be read: keep what's on screen
      if (fromOtherTab) clearTimeout(saveTimer.current); // the other tab's copy is newer; don't write ours over it
      skipSave.current = true; // just loaded, nothing to save back
      history.current = createHistory(); // undo steps from before would roll back the other tab's work
      latest.current = next;
      setState(next);
    };
    load(false);
    keepStorage();
    const off = onOtherTabSave(() => load(true));
    return () => { live = false; off(); };
  }, []);

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
          await savePlanner(JSON.stringify(state));
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

  /**
   * Apply a mutation to a deep copy of state (undoable). Quick edits merge
   * into one undo step; pass { separate: true } for things like deleting,
   * which should always be undoable on their own.
   */
  const update = useCallback((fn, { separate = false } = {}) => {
    const prev = latest.current;
    const draft = cloneState(prev);
    fn(draft);
    delete draft.sample; // the teacher has started using it
    history.current = record(history.current, prev, Date.now(), separate);
    latest.current = draft;
    setState(draft);
  }, []);

  /**
   * Apply changes that came from elsewhere (online sync). Saved, but not an
   * undo step — undoing must never roll back a teammate's edit, so the change
   * is applied to the undo history as well (skip that with { history: false }
   * when it changes nothing the history doesn't already have).
   */
  const applyRemote = useCallback((fn, { history: patchHistory = true } = {}) => {
    if (!latest.current) return;
    const draft = cloneState(latest.current);
    fn(draft);
    if (patchHistory) history.current = applyToHistory(history.current, fn);
    skipSave.current = false;
    latest.current = draft;
    setState(draft);
  }, []);

  /** Swap in a whole planner (restore, import, sample data) — also undoable. */
  const replace = useCallback((next) => {
    if (latest.current) history.current = record(history.current, latest.current, Date.now(), true);
    skipSave.current = false;
    setLoadError(null);
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
    () => ({ state, update, applyRemote, replace, undo, redo, notify, toast, year, classes, calendar, userId: state?.currentUserId, vault, openVault, loadError, latest }),
    [state, update, applyRemote, replace, undo, redo, notify, toast, year, classes, calendar, vault, openVault, loadError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

/**
 * Swapping in the sample or an empty planner keeps the teacher's own
 * settings: how the app looks and which tours they've seen.
 */
function keepPersonal(next, prev) {
  const mine = prev && currentUser(prev);
  const theirs = currentUser(next);
  if (mine && theirs) {
    if (mine.appearance) theirs.appearance = structuredClone(mine.appearance);
    if (mine.tutorial) theirs.tutorial = structuredClone(mine.tutorial);
  }
  return next;
}
export function resetToDemo(prev) {
  return keepPersonal(demoState(), prev);
}
export function resetToEmpty(prev) {
  return keepPersonal(emptyState(), prev);
}
