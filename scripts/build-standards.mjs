// Builds the state standards catalog the app downloads from GitHub Pages.
//
// Input: the Learning Commons Knowledge Graph export (nodes.jsonl and
// relationships.jsonl, CC BY 4.0 with per-state attribution).
// Output (in --out):
//   index.json          every standards framework, with counts and grades
//   fw/<id>.json        one framework's standards in document order
//
// Usage: node scripts/build-standards.mjs --nodes nodes.jsonl \
//          --rels relationships.jsonl --out site/standards --version 1.14.0

import { createReadStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
for (const k of ['nodes', 'rels', 'out']) {
  if (!args[k]) { console.error(`Missing --${k}`); process.exit(1); }
}

const SUBJECTS = { Mathematics: 'Math', 'English Language Arts': 'ELA' };
const GRADE_ORDER = ['PK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/** Plain text: drop the light HTML and markdown some states use. */
function clean(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n\s*/g, '\n')
    .replace(/^\* /gm, '• ')
    .trim();
}

const parseGrades = (raw) => {
  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch { list = []; }
  return GRADE_ORDER.filter((g) => list.includes(g));
};

async function eachLine(path, fn) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) fn(JSON.parse(line));
}

const frameworks = new Map(); // node id -> properties
const items = new Map(); // node id -> compact item
await eachLine(args.nodes, (n) => {
  const p = n.properties || {};
  if (n.labels?.[0] === 'StandardsFramework') frameworks.set(n.identifier, p);
  else if (n.labels?.[0] === 'StandardsFrameworkItem') {
    items.set(n.identifier, {
      id: p.caseIdentifierUUID || n.identifier,
      code: clean(p.statementCode || p.alternateStatementCode || '').replace(/\n/g, ' '),
      text: clean(p.description || p.name || ''),
      grades: parseGrades(p.gradeLevel),
      kind: p.normalizedStatementType || null,
      pos: Number(p.position) || 0,
    });
  }
});

const children = new Map();
await eachLine(args.rels, (r) => {
  if (r.label !== 'hasChild' || r.target_labels?.[0] !== 'StandardsFrameworkItem') return;
  if (!['StandardsFramework', 'StandardsFrameworkItem'].includes(r.source_labels?.[0])) return;
  if (!children.has(r.source_identifier)) children.set(r.source_identifier, []);
  children.get(r.source_identifier).push(r.target_identifier);
});
for (const list of children.values()) list.sort((a, b) => (items.get(a)?.pos || 0) - (items.get(b)?.pos || 0));

/** Walk a framework in document order. Groupings become the `group` label. */
function standardsOf(rootId) {
  const out = [];
  const seen = new Set();
  const walk = (id, groups, leavesOnly) => {
    for (const childId of children.get(id) || []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      const it = items.get(childId);
      if (!it) continue;
      const kids = children.get(childId) || [];
      const isStandard = leavesOnly ? kids.length === 0 : it.kind === 'Standard';
      if (isStandard && it.text) {
        out.push({ id: it.id, code: it.code, text: it.text, grades: it.grades, group: groups.slice(-2).join(' › ') });
        walk(childId, groups, leavesOnly);
      } else {
        const flat = it.text.replace(/\n/g, ' ');
        const label = it.kind === 'Standard Grouping' ? (flat.length > 90 ? `${flat.slice(0, 87)}…` : flat) : '';
        walk(childId, label ? [...groups, label] : groups, leavesOnly);
      }
    }
  };
  walk(rootId, [], false);
  if (out.length) return out;
  // A few frameworks don't label their standards; fall back to the leaves.
  seen.clear();
  walk(rootId, [], true);
  return out;
}

rmSync(args.out, { recursive: true, force: true });
mkdirSync(join(args.out, 'fw'), { recursive: true });

const index = [];
for (const [nodeId, p] of frameworks) {
  const standards = standardsOf(nodeId);
  if (!standards.length) continue;
  const id = p.caseIdentifierUUID || nodeId;
  const grades = GRADE_ORDER.filter((g) => standards.some((s) => s.grades.includes(g)));
  const meta = {
    id,
    name: clean(p.name),
    jurisdiction: p.jurisdiction,
    subject: SUBJECTS[p.academicSubject] || p.academicSubject,
    current: p.isCurrent === 'true' || p.isCurrent === true,
    author: p.author || '',
    updated: p.dateModified || '',
    license: p.license || '',
    attribution: p.attributionStatement || '',
    grades,
    count: standards.length,
  };
  writeFileSync(join(args.out, 'fw', `${id}.json`), JSON.stringify({ ...meta, standards }));
  index.push(meta);
}
index.sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || a.subject.localeCompare(b.subject) || Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));

writeFileSync(join(args.out, 'index.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: {
    name: 'Learning Commons Knowledge Graph',
    version: args.version || '',
    url: 'https://docs.learningcommons.org/knowledge-graph/datasets/us-academic-standards',
    license: 'https://creativecommons.org/licenses/by/4.0/',
  },
  frameworks: index,
}));
console.log(`${index.length} frameworks, ${index.reduce((n, f) => n + f.count, 0)} standards → ${args.out}`);
