// Mutations that touch several parts of state. Each takes a draft (a deep
// copy handed out by store.update) and mutates it in place.
import { makeLesson, uid } from './model.js';

export function findClass(d, id) {
  return d.classes.find((c) => c.id === id) || d.banks.find((b) => b.id === id);
}

export function editSequence(d, containerId, fn) {
  const c = findClass(d, containerId);
  c.sequence = fn(c.sequence || []);
}

/** Re-key section content from one container's sections to another's by name, then position. */
export function remapContent(content, fromSections, toSections) {
  const out = {};
  fromSections.forEach((sec, i) => {
    const text = content[sec.id];
    if (!text) return;
    const target = toSections.find((t) => t.name.toLowerCase() === sec.name.toLowerCase()) || toSections[i] || toSections[0];
    if (!target) return;
    out[target.id] = out[target.id] ? `${out[target.id]}\n\n${text}` : text;
  });
  return out;
}

/** Duplicate a lesson into a container; returns the new lesson id. */
export function copyLesson(d, lessonId, targetId, userId) {
  const src = d.lessons[lessonId];
  const from = findClass(d, src.homeId);
  const to = findClass(d, targetId);
  const copy = makeLesson({
    ...structuredClone(src),
    id: uid('lesson'),
    homeType: d.banks.some((b) => b.id === targetId) ? 'bank' : 'class',
    homeId: targetId,
    ownerId: userId,
    content: remapContent(src.content || {}, from?.sections || [], to.sections),
    privateNotes: {},
    statusIds: [],
    updatedAt: Date.now(),
  });
  d.lessons[copy.id] = copy;
  return copy.id;
}

/** Remove lessons that are no longer referenced by any sequence. */
export function pruneOrphans(d) {
  const used = new Set();
  for (const c of [...d.classes, ...d.banks]) for (const id of c.sequence || []) if (id) used.add(id);
  for (const id of Object.keys(d.lessons)) if (!used.has(id)) delete d.lessons[id];
}

/**
 * A bank (or some of its lessons) is going away: deleted, left, or removed
 * online by a teammate. Lessons linked into a class become that class's own
 * lessons (sections matched by name) so plans keep working; unlinked ones go.
 * onlyIds limits this to particular lessons.
 */
export function releaseBankLessons(d, bankId, userId, onlyIds = null) {
  const bank = d.banks.find((b) => b.id === bankId);
  for (const lesson of Object.values(d.lessons)) {
    if (lesson.homeType !== 'bank' || lesson.homeId !== bankId) continue;
    if (onlyIds && !onlyIds.has(lesson.id)) continue;
    const cls = d.classes.find((c) => (c.sequence || []).includes(lesson.id));
    if (!cls) {
      delete d.lessons[lesson.id];
      continue;
    }
    if (bank) lesson.content = remapContent(lesson.content || {}, bank.sections || [], cls.sections || []);
    Object.assign(lesson, { homeType: 'class', homeId: cls.id, ownerId: userId, updatedAt: Date.now() });
  }
}

/** Delete a bank from this planner, keeping lessons that classes use. */
export function deleteBankLocally(d, bankId, userId) {
  releaseBankLessons(d, bankId, userId);
  d.banks = d.banks.filter((b) => b.id !== bankId);
}

/**
 * Lessons whose home class is going away but that another class (or bank)
 * still uses through "Link into another class…" move there, with their
 * section content re-keyed to the new home's sections so nothing disappears.
 */
export function releaseClassLessons(d, classId) {
  const deleted = d.classes.find((c) => c.id === classId);
  for (const lesson of Object.values(d.lessons)) {
    if (lesson.homeType !== 'class' || lesson.homeId !== classId) continue;
    const uses = (c) => c.id !== classId && (c.sequence || []).includes(lesson.id);
    const cls = d.classes.find(uses);
    const bank = cls ? null : d.banks.find(uses);
    const home = cls || bank;
    if (!home) continue; // pruned below
    if (deleted) lesson.content = remapContent(lesson.content || {}, deleted.sections || [], home.sections || []);
    Object.assign(lesson, { homeType: cls ? 'class' : 'bank', homeId: home.id, updatedAt: Date.now() });
  }
}

/** Delete a class with its meeting times; keeps lessons other classes link to. */
export function deleteClassLocally(d, classId) {
  releaseClassLessons(d, classId);
  d.classes = d.classes.filter((c) => c.id !== classId);
  for (const y of d.years) {
    y.overrides = (y.overrides || []).filter((o) => o.classId !== classId);
    for (const t of y.dayTypes || []) t.slots = t.slots.filter((s) => s.classId !== classId);
  }
  pruneOrphans(d);
}
