// Undo / redo for the whole planner. Snapshots are whole-state copies (the
// state is small), and changes made in quick succession — typing in a lesson,
// dragging a slider — collapse into a single undo step.

export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 800;

export function createHistory() {
  return { past: [], future: [], lastAt: 0 };
}

/**
 * Remember `prev` (the state before a change) unless it belongs to the last
 * step. `separate` always starts a new step (e.g. restoring a backup).
 */
export function record(h, prev, now = Date.now(), separate = false) {
  if (!prev) return h;
  const coalesce = !separate && h.past.length > 0 && now - h.lastAt < COALESCE_MS;
  const past = coalesce ? h.past : [...h.past, prev].slice(-HISTORY_LIMIT);
  return { past, future: [], lastAt: separate ? 0 : now };
}

export function undo(h, current) {
  if (!h.past.length) return null;
  const state = h.past[h.past.length - 1];
  return { state, history: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, HISTORY_LIMIT), lastAt: 0 } };
}

export function redo(h, current) {
  if (!h.future.length) return null;
  const [state, ...future] = h.future;
  return { state, history: { past: [...h.past, current].slice(-HISTORY_LIMIT), future, lastAt: 0 } };
}

/**
 * Apply a change that came from elsewhere (a teammate's edit, pulled by
 * sync) to every undo and redo step too, so undoing a local edit never rolls
 * a teammate's change back. Steps are old states nobody else holds, so they
 * are changed in place; a step the change doesn't fit (say, from before a
 * bank existed) is left as it was.
 */
export function applyToHistory(h, fn) {
  for (const snapshot of [...h.past, ...h.future]) {
    try {
      fn(snapshot);
    } catch {
      /* leave this step unchanged */
    }
  }
  return h;
}
