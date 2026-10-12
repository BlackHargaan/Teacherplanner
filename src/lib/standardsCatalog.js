// State standards catalog: official standards for all 50 states and D.C.
// (math, ELA, science, social studies), published to GitHub Pages by
// .github/workflows/site.yml from the Learning Commons Knowledge Graph
// (CC BY 4.0). Teachers download only the frameworks they pick; after that
// they live in the planner file and work offline.
//
// Standards keep the official CASE identifiers from the source data, so the
// same standard has the same id for every teacher and across updates.

export const CATALOG_URL = 'https://blackhargaan.github.io/Teacherplanner/standards/';
export const CATALOG_SOURCE = 'learning-commons';
export const VERSION_DATE = { month: 'short', day: 'numeric', year: 'numeric' };
export const GRADES = ['PK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

async function getJSON(url, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new Error('Couldn’t reach the standards library. Check your internet connection and try again.');
  }
  if (!res.ok) throw new Error(`The standards library isn’t available right now (error ${res.status}). Try again later.`);
  return res.json();
}

export const fetchCatalog = (fetchImpl = fetch) => getJSON(`${CATALOG_URL}index.json`, fetchImpl);
export const fetchFramework = (id, fetchImpl = fetch) => getJSON(`${CATALOG_URL}fw/${encodeURIComponent(id)}.json`, fetchImpl);

export const localId = (catalogId) => `lc-${catalogId}`;

/** "K", "3", "9–12", "K–12" */
export function gradeLabel(grades = []) {
  const sorted = GRADES.filter((g) => grades.includes(g));
  if (!sorted.length) return '';
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]}–${sorted.at(-1)}`;
}

const keepGrade = (grades) => (s) => !grades?.length || !s.grades?.length || s.grades.some((g) => grades.includes(g));

/** About 10% of state standards have no code; label those by their opening words. */
const codeFor = (s) => {
  if (s.code) return s.code;
  const first = s.text.split('\n')[0];
  if (first.length <= 40) return first;
  const cut = first.slice(0, 40);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
};

/**
 * A downloaded catalog framework as the planner stores it.
 * grades: only keep standards for these grades (null/[] = all).
 */
export function toLocalFramework(data, grades = null) {
  return {
    id: localId(data.id),
    name: data.name,
    subject: data.subject,
    region: data.jurisdiction,
    source: { catalog: CATALOG_SOURCE, id: data.id, updated: data.updated, current: data.current },
    attribution: data.attribution,
    license: data.license,
    grades: grades?.length ? GRADES.filter((g) => grades.includes(g)) : null,
    standards: data.standards.filter(keepGrade(grades)).map((s) => ({
      id: s.id,
      code: codeFor(s),
      description: s.text,
      grade: gradeLabel(s.grades),
      grades: s.grades,
      group: s.group || '',
    })),
  };
}

/** Every standard id a lesson, template, assignment or score refers to. */
export function usedStandardIds(state) {
  const ids = new Set();
  for (const l of Object.values(state.lessons || {})) for (const id of l.standardIds || []) ids.add(id);
  for (const t of state.templates || []) for (const id of t.standardIds || []) ids.add(id);
  for (const c of state.classes || []) {
    for (const a of c.gradebook?.assignments || []) for (const id of a.standardIds || []) ids.add(id);
    for (const s of c.standardScores || []) ids.add(s.standardId);
  }
  return ids;
}

/**
 * Replace a framework with a newer download, keeping the teacher's grade
 * choice. Standards the state removed stay (marked retired) if anything
 * still refers to them, so old lessons and scores keep their labels.
 */
export function updatedFramework(existing, data, usedIds) {
  const next = toLocalFramework(data, existing.grades);
  const present = new Set(next.standards.map((s) => s.id));
  const retired = existing.standards
    .filter((s) => !present.has(s.id) && usedIds.has(s.id))
    .map((s) => ({ ...s, retired: true }));
  return { ...next, standards: [...next.standards, ...retired] };
}

/** Catalog frameworks newer than the copy in the planner. */
export function updatesAvailable(frameworks, catalog) {
  const byId = Object.fromEntries((catalog?.frameworks || []).map((f) => [f.id, f]));
  return frameworks.filter((f) => f.source?.catalog === CATALOG_SOURCE && byId[f.source.id] && byId[f.source.id].updated > (f.source.updated || ''));
}
