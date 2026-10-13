import { describe, it, expect } from 'vitest';
import { deleteClassLocally } from '../src/lib/actions.js';
import { demoState, makeClass, makeLesson, makeSections } from '../src/lib/model.js';

function planner() {
  const d = demoState();
  const year = d.years[0];
  const gone = makeClass({ id: 'cls-gone', yearId: year.id, ownerId: d.currentUserId, sections: makeSections(['Goals', 'Lab']) });
  const keeps = makeClass({ id: 'cls-keeps', yearId: year.id, ownerId: d.currentUserId, sections: makeSections(['Warm-up', 'lab', 'Goals']) });
  const shared = makeLesson({ id: 'l-shared', homeType: 'class', homeId: gone.id, title: 'Shared', content: { [gone.sections[0].id]: 'Learn things', [gone.sections[1].id]: 'Mix things' } });
  const own = makeLesson({ id: 'l-own', homeType: 'class', homeId: gone.id, title: 'Only here' });
  gone.sequence = [shared.id, own.id];
  keeps.sequence = [shared.id];
  d.classes.push(gone, keeps);
  d.lessons[shared.id] = shared;
  d.lessons[own.id] = own;
  return { d, gone, keeps };
}

describe('deleting a class', () => {
  it('moves lessons another class links to into that class, with their content', () => {
    const { d, gone, keeps } = planner();
    deleteClassLocally(d, gone.id);
    expect(d.classes.some((c) => c.id === gone.id)).toBe(false);
    const kept = d.lessons['l-shared'];
    expect(kept).toMatchObject({ homeType: 'class', homeId: keeps.id, title: 'Shared' });
    // sections matched by name (case doesn't matter)
    expect(kept.content[keeps.sections[2].id]).toBe('Learn things');
    expect(kept.content[keeps.sections[1].id]).toBe('Mix things');
    expect(Object.keys(kept.content).every((id) => keeps.sections.some((s) => s.id === id))).toBe(true);
  });

  it('removes lessons nothing else uses, and the class’s meeting times', () => {
    const { d, gone } = planner();
    const t = d.years[0].dayTypes?.[0];
    if (t) t.slots.push({ id: 'slot-x', classId: gone.id });
    deleteClassLocally(d, gone.id);
    expect(d.lessons['l-own']).toBeUndefined();
    for (const y of d.years) for (const dt of y.dayTypes || []) expect(dt.slots.some((s) => s.classId === gone.id)).toBe(false);
  });
});
