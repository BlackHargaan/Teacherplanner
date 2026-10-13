import { describe, it, expect } from 'vitest';
import { TOURS, markTour, pageTourFor, placeBox, resetPageTours, setTips, shouldOfferPage, shouldOfferStart } from '../src/lib/tours.js';

const PAGES = ['planner', 'setup', 'classes', 'templates', 'collaborate', 'standards', 'views', 'gradebook', 'seating', 'google', 'settings'];

describe('tour content', () => {
  it('has a getting-started tour and one for every page', () => {
    expect(TOURS.start.steps.length).toBeGreaterThan(5);
    for (const p of PAGES) expect(TOURS[p], p).toBeTruthy();
  });

  it('every step has a title and an explanation, and only goes to real pages', () => {
    for (const [id, tour] of Object.entries(TOURS)) {
      expect(tour.title, id).toBeTruthy();
      for (const s of tour.steps) {
        expect(s.title && s.body, `${id}: ${s.title}`).toBeTruthy();
        if (s.route) expect(PAGES, `${id}: ${s.title}`).toContain(s.route);
      }
    }
  });

  it('a page tour only goes to its own page', () => {
    for (const p of PAGES) for (const s of TOURS[p].steps) if (s.route) expect(s.route).toBe(p);
  });
});

describe('when tours are offered', () => {
  it('offers the getting-started tour once, whether taken or skipped', () => {
    const me = {};
    expect(shouldOfferStart(me)).toBe(true);
    markTour(me, 'start', 'skipped');
    expect(shouldOfferStart(me)).toBe(false);
  });

  it('offers a page tour on the first visit, after the getting-started tour, unless turned off', () => {
    const me = {};
    expect(shouldOfferPage(me, 'gradebook')).toBe(false); // getting-started tour first
    markTour(me, 'start');
    expect(shouldOfferPage(me, 'gradebook')).toBe(true);
    expect(shouldOfferPage(me, 'search')).toBe(false); // no tour for that page
    markTour(me, 'gradebook', 'offered');
    expect(shouldOfferPage(me, 'gradebook')).toBe(false);
    expect(shouldOfferPage(me, 'seating')).toBe(true);
    setTips(me, false);
    expect(shouldOfferPage(me, 'seating')).toBe(false);
  });

  it('can offer every page tour again, without restarting the getting-started tour', () => {
    const me = {};
    markTour(me, 'start');
    markTour(me, 'gradebook');
    setTips(me, false);
    resetPageTours(me);
    expect(shouldOfferStart(me)).toBe(false);
    expect(shouldOfferPage(me, 'gradebook')).toBe(true);
  });

  it('knows which pages have a tour', () => {
    expect(pageTourFor('gradebook')).toBe('gradebook');
    expect(pageTourFor('start')).toBeNull();
    expect(pageTourFor('view')).toBeNull();
  });
});

describe('placing the explanation box', () => {
  const box = { width: 300, height: 150 };
  const rect = (top, left, width, height) => ({ top, left, width, height, bottom: top + height, right: left + width });

  it('goes below the highlight when there is room, centered on it and kept on screen', () => {
    expect(placeBox(rect(100, 500, 200, 40), box, 1280, 800)).toEqual({ top: 152, left: 450, placement: 'bottom' });
    expect(placeBox(rect(100, 0, 40, 40), box, 1280, 800).left).toBe(12);
  });

  it('goes above when there is no room below, then beside', () => {
    expect(placeBox(rect(700, 500, 200, 60), box, 1280, 800).placement).toBe('top');
    expect(placeBox(rect(100, 100, 300, 650), box, 1280, 800).placement).toBe('right');
    expect(placeBox(rect(100, 900, 300, 650), box, 1280, 800).placement).toBe('left');
  });

  it('sits in the middle when there is nothing to point at, and inside a highlight bigger than the window', () => {
    expect(placeBox(null, box, 1280, 800)).toEqual({ top: 325, left: 490, placement: 'center' });
    const p = placeBox(rect(0, 0, 1280, 800), box, 1280, 800);
    expect(p.placement).toBe('inside');
    expect(p.top + box.height).toBeLessThanOrEqual(800);
  });
});
