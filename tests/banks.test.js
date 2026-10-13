import { describe, it, expect } from 'vitest';
import { deleteBankLocally, releaseBankLessons } from '../src/lib/actions.js';
import { demoState, makeBank, makeLesson, makeSections } from '../src/lib/model.js';

function planner() {
  const d = demoState();
  const bank = makeBank({ id: 'bank-x', ownerId: d.currentUserId, sections: makeSections(['Objectives', 'Activities']) });
  const linked = makeLesson({ id: 'l-linked', homeType: 'bank', homeId: bank.id, title: 'Linked', content: { [bank.sections[0].id]: 'Goals', [bank.sections[1].id]: 'Lab' } });
  const unused = makeLesson({ id: 'l-unused', homeType: 'bank', homeId: bank.id, title: 'Unused' });
  bank.sequence = [linked.id, unused.id];
  d.banks.push(bank);
  d.lessons[linked.id] = linked;
  d.lessons[unused.id] = unused;
  const cls = d.classes[0];
  cls.sequence.push(linked.id);
  return { d, bank, cls };
}

describe('deleting a lesson bank', () => {
  it('keeps lessons classes use (as the class’s own) and removes the rest', () => {
    const { d, bank, cls } = planner();
    deleteBankLocally(d, bank.id, d.currentUserId);
    expect(d.banks.some((b) => b.id === bank.id)).toBe(false);
    expect(d.lessons['l-unused']).toBeUndefined();
    const kept = d.lessons['l-linked'];
    expect(kept).toMatchObject({ homeType: 'class', homeId: cls.id, ownerId: d.currentUserId, title: 'Linked' });
    // content moved onto the class's sections, matched by name where possible
    const objectives = cls.sections.find((s) => s.name.toLowerCase() === 'objectives');
    if (objectives) expect(kept.content[objectives.id]).toContain('Goals');
    expect(Object.values(kept.content).join(' ')).toContain('Lab');
  });

  it('can release just some lessons', () => {
    const { d, bank } = planner();
    releaseBankLessons(d, bank.id, d.currentUserId, new Set(['l-unused']));
    expect(d.lessons['l-unused']).toBeUndefined();
    expect(d.lessons['l-linked'].homeType).toBe('bank');
  });
});
