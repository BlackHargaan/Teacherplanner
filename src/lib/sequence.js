// Lesson sequencing. Each class (and lesson bank) keeps an ordered array of
// lesson ids; entry i is taught at the class's i-th meeting. `null` marks a
// meeting with no lesson. Because placement is positional, changes to the
// calendar (snow days, extra classes) automatically flow lessons forward or
// back, and bump / extend / delete are simple array edits.
// All functions are pure and return a new array.

function trimTrailingNulls(seq) {
  const out = [...seq];
  while (out.length && out[out.length - 1] == null) out.pop();
  return out;
}

function padTo(seq, index) {
  const out = [...seq];
  while (out.length < index) out.push(null);
  return out;
}

/** Insert `count` empty days at `index`, pushing later lessons forward. */
export function bump(seq, index, count = 1) {
  const out = padTo(seq, index);
  out.splice(index, 0, ...Array(count).fill(null));
  return trimTrailingNulls(out);
}

/** Remove the entry at `index`, pulling later lessons back one meeting. */
export function pullBack(seq, index) {
  if (index >= seq.length) return [...seq];
  const out = [...seq];
  out.splice(index, 1);
  return trimTrailingNulls(out);
}

/** Make the lesson at `index` span one more meeting (later lessons bump). */
export function extend(seq, index) {
  if (seq[index] == null) return [...seq];
  const out = [...seq];
  out.splice(index + 1, 0, seq[index]);
  return out;
}

/** Put a lesson at `index` without disturbing others (replaces the slot). */
export function place(seq, index, lessonId) {
  const out = padTo(seq, index + 1);
  out[index] = lessonId;
  return trimTrailingNulls(out);
}

/** Insert a lesson at `index`, bumping the lesson already there forward. */
export function insertAt(seq, index, lessonId) {
  const out = padTo(seq, index);
  out.splice(index, 0, lessonId);
  return trimTrailingNulls(out);
}

/** Clear a slot, leaving the day empty (no shifting). */
export function clearAt(seq, index) {
  if (index >= seq.length) return [...seq];
  const out = [...seq];
  out[index] = null;
  return trimTrailingNulls(out);
}

/**
 * Move a lesson within the same sequence. The original day is left empty. If
 * the target day is empty the lesson simply goes there; otherwise it's
 * inserted, bumping the lesson already there (and later ones) forward.
 */
export function move(seq, from, to) {
  const id = seq[from];
  if (id == null || from === to) return [...seq];
  const cleared = [...seq];
  cleared[from] = null;
  return placeOrInsert(cleared, to, id);
}

/** Put a lesson on a day: fill it if empty, otherwise insert and bump forward. */
export function placeOrInsert(seq, index, lessonId) {
  return seq[index] == null ? place(seq, index, lessonId) : insertAt(seq, index, lessonId);
}

/** Swap two slots. */
export function swap(seq, a, b) {
  const out = padTo(seq, Math.max(a, b) + 1);
  [out[a], out[b]] = [out[b], out[a]];
  return trimTrailingNulls(out);
}

export function lessonIdAt(seq, index) {
  return seq && index < seq.length ? seq[index] : null;
}
