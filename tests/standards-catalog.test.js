import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchCatalog, gradeLabel, toLocalFramework, updatedFramework, updatesAvailable, usedStandardIds,
} from '../src/lib/standardsCatalog.js';
import { cloneState, emptyState } from '../src/lib/model.js';

const download = {
  id: 'fw-1',
  name: 'Mathematics: NCSCOS',
  jurisdiction: 'North Carolina',
  subject: 'Math',
  current: true,
  updated: '2026-01-01',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'NC standards provided by NCDPI.',
  standards: [
    { id: 'a', code: 'NC.6.RP.1', text: 'Ratios', grades: ['6'], group: 'Ratios › Understand ratios' },
    { id: 'b', code: 'NC.7.EE.4', text: 'Use variables', grades: ['7'], group: 'Expressions' },
    { id: 'c', code: '', text: 'Make sense of problems and persevere in solving them, always.', grades: ['6', '7', '8'], group: 'Practices' },
    { id: 'd', code: 'X.1', text: 'No grade given', grades: [], group: '' },
  ],
};

describe('state standards catalog', () => {
  it('labels grade ranges', () => {
    expect(gradeLabel([])).toBe('');
    expect(gradeLabel(['7'])).toBe('7');
    expect(gradeLabel(['12', '9', '10', '11'])).toBe('9–12');
    expect(gradeLabel(['K', '1', '2'])).toBe('K–2');
  });

  it('converts a download, keeping official ids and only the chosen grades', () => {
    const fw = toLocalFramework(download, ['7']);
    expect(fw.id).toBe('lc-fw-1');
    expect(fw.region).toBe('North Carolina');
    expect(fw.source).toMatchObject({ catalog: 'learning-commons', id: 'fw-1', updated: '2026-01-01' });
    expect(fw.grades).toEqual(['7']);
    expect(fw.standards.map((s) => s.id)).toEqual(['b', 'c', 'd']); // 6th-grade only one dropped; ungraded kept
    expect(fw.standards[1].code).toBe('Make sense of problems and persevere in…'); // no code: opening words, whole words only
    expect(fw.standards[1].grade).toBe('6–8');
    expect(toLocalFramework(download, []).standards).toHaveLength(4);
    expect(toLocalFramework(download).grades).toBeNull();
  });

  it('finds every standard the planner refers to', () => {
    const state = {
      lessons: { l1: { standardIds: ['a'] } },
      templates: [{ standardIds: ['b'] }],
      classes: [{ gradebook: { assignments: [{ standardIds: ['c'] }] }, standardScores: [{ standardId: 'z' }] }],
    };
    expect([...usedStandardIds(state)].sort()).toEqual(['a', 'b', 'c', 'z']);
  });

  it('updates keep the grade choice and retire removed standards that are still in use', () => {
    const existing = toLocalFramework(download, ['6', '7']);
    const newer = { ...download, updated: '2026-08-01', standards: [download.standards[1], { id: 'e', code: 'NC.6.RP.2', text: 'New', grades: ['6'] }] };
    const next = updatedFramework(existing, newer, new Set(['a']));
    expect(next.grades).toEqual(['6', '7']);
    expect(next.source.updated).toBe('2026-08-01');
    expect(next.standards.map((s) => [s.id, Boolean(s.retired)])).toEqual([['b', false], ['e', false], ['a', true]]);
  });

  it('spots newer versions in the catalog', () => {
    const fw = toLocalFramework(download);
    expect(updatesAvailable([fw], { frameworks: [{ id: 'fw-1', updated: '2026-01-01' }] })).toEqual([]);
    expect(updatesAvailable([fw], { frameworks: [{ id: 'fw-1', updated: '2026-02-01' }] })).toEqual([fw]);
    expect(updatesAvailable([{ id: 'custom', standards: [] }], { frameworks: [] })).toEqual([]);
  });

  it('explains network and server failures in plain words', async () => {
    await expect(fetchCatalog(() => Promise.reject(new TypeError('fetch failed')))).rejects.toThrow(/internet connection/);
    await expect(fetchCatalog(() => Promise.resolve({ ok: false, status: 404 }))).rejects.toThrow(/error 404/);
    await expect(fetchCatalog(() => Promise.resolve({ ok: true, json: () => ({ frameworks: [] }) }))).resolves.toEqual({ frameworks: [] });
  });
});

describe('cloneState', () => {
  it('shares downloaded standards between copies but deep-copies everything else', () => {
    const state = emptyState();
    state.frameworks.push(toLocalFramework(download), { id: 'mine', name: 'Mine', standards: [{ id: 'm1', code: 'M1' }] });
    const copy = cloneState(state);
    expect(copy.frameworks[0]).not.toBe(state.frameworks[0]);
    expect(copy.frameworks[0].standards).toBe(state.frameworks[0].standards);
    expect(copy.frameworks[1].standards).not.toBe(state.frameworks[1].standards);
    copy.frameworks[1].standards.push({ id: 'm2' });
    expect(state.frameworks[1].standards).toHaveLength(1);
    expect(copy.classes).not.toBe(state.classes);
  });
});

describe('build-standards script', () => {
  it('turns a Knowledge Graph export into an index and per-framework files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kg-'));
    const node = (identifier, labels, properties) => JSON.stringify({ type: 'node', identifier, labels, properties });
    const item = (id, props) => node(id, ['StandardsFrameworkItem'], { gradeLevel: '[]', ...props });
    const rel = (source, sourceLabel, target) => JSON.stringify({
      type: 'relationship', label: 'hasChild', source_identifier: source, source_labels: [sourceLabel], target_identifier: target, target_labels: ['StandardsFrameworkItem'],
    });
    writeFileSync(join(dir, 'nodes.jsonl'), [
      node('F', ['StandardsFramework'], {
        caseIdentifierUUID: 'case-F', name: 'Math <b>2026</b>', jurisdiction: 'Ohio', academicSubject: 'Mathematics', isCurrent: 'true', dateModified: '2026-05-01', attributionStatement: 'Ohio DOE', license: 'cc-by',
      }),
      item('G', { normalizedStatementType: 'Standard Grouping', description: 'Number Sense', position: '1' }),
      item('S2', { caseIdentifierUUID: 'case-S2', normalizedStatementType: 'Standard', statementCode: '1.NS.2', description: 'Second', gradeLevel: '["1"]', position: '2' }),
      item('S1', { caseIdentifierUUID: 'case-S1', normalizedStatementType: 'Standard', statementCode: '1.NS.1', description: '**Count** to 120\n* by ones', gradeLevel: '["1","K"]', position: '1' }),
      node('E', ['StandardsFramework'], { name: 'Empty', jurisdiction: 'Ohio', academicSubject: 'Science' }),
      node('L', ['StandardsFramework'], { name: 'Unlabeled', jurisdiction: 'Utah', academicSubject: 'Science', isCurrent: 'false' }),
      item('X', { normalizedStatementType: 'Other', description: 'Leaf only', gradeLevel: '["5"]' }),
    ].join('\n'));
    writeFileSync(join(dir, 'rels.jsonl'), [
      rel('F', 'StandardsFramework', 'G'), rel('G', 'StandardsFrameworkItem', 'S2'), rel('G', 'StandardsFrameworkItem', 'S1'),
      rel('L', 'StandardsFramework', 'X'),
    ].join('\n'));
    const out = join(dir, 'out');
    execFileSync('node', ['scripts/build-standards.mjs', '--nodes', join(dir, 'nodes.jsonl'), '--rels', join(dir, 'rels.jsonl'), '--out', out, '--version', '9.9.9']);

    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    expect(index.source.version).toBe('9.9.9');
    expect(index.frameworks.map((f) => [f.id, f.jurisdiction, f.subject, f.current, f.count])).toEqual([
      ['case-F', 'Ohio', 'Math', true, 2],
      ['L', 'Utah', 'Science', false, 1], // no labelled standards: falls back to leaves
    ]);
    const fw = JSON.parse(readFileSync(join(out, 'fw', 'case-F.json'), 'utf8'));
    expect(fw.name).toBe('Math 2026');
    expect(fw.grades).toEqual(['K', '1']);
    expect(fw.standards).toEqual([
      { id: 'case-S1', code: '1.NS.1', text: 'Count to 120\n• by ones', grades: ['K', '1'], group: 'Number Sense' },
      { id: 'case-S2', code: '1.NS.2', text: 'Second', grades: ['1'], group: 'Number Sense' },
    ]);
  });
});
