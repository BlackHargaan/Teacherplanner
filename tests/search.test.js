import { describe, it, expect } from 'vitest';
import { searchLessons, lessonPlacements } from '../src/lib/search.js';
import { demoState } from '../src/lib/model.js';

describe('searchLessons', () => {
  const state = demoState();
  const me = state.currentUserId;
  it('finds by title, section text and standard code, with dates', () => {
    const byTitle = searchLessons(state, 'proportional', me);
    expect(byTitle[0].lesson.title).toMatch(/Proportional/i);
    expect(byTitle[0].placements[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(searchLessons(state, 'onion', me)[0].lesson.title).toBe('Cells: the building blocks');
    expect(searchLessons(state, 'MS-LS1-1', me)[0].field).toBe('Standard');
  });
  it('requires every word and hides lessons the teacher cannot see', () => {
    expect(searchLessons(state, 'onion graph', me)).toEqual([]);
    const lee = state.users.find((u) => u.id !== me).id;
    expect(searchLessons(state, 'onion', lee)).toEqual([]);
    expect(searchLessons(state, 'food webs', lee).length).toBe(1);
  });
  it('includes the shared bank lessons the teacher can view', () => {
    expect(searchLessons(state, 'food webs', me).length).toBe(1);
    expect(Object.keys(lessonPlacements(state, me)).length).toBeGreaterThan(5);
  });
});
