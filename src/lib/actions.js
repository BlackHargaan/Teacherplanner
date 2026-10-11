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
