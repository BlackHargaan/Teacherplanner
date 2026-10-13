import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../lib/store.jsx';
import { currentUser } from '../lib/model.js';
import { useHashRoute, navigate } from '../lib/router.js';
import { TOURS, markTour, pageTourFor, placeBox, shouldOfferPage, shouldOfferStart } from '../lib/tours.js';

const TourContext = createContext({ start: () => {}, pageTour: null });
export const useTour = () => useContext(TourContext);

// Automated tests (and kiosk setups) can turn tours off entirely.
const disabled = () => { try { return localStorage.getItem('teacher-planner:tours') === 'off'; } catch { return false; } };
const PAGES_WITHOUT_TOURS = new Set(['view', 'print']);

/**
 * Guided tours. Offers the getting-started tour on first launch and a short
 * tour the first time each page is opened; either can be started again from
 * the ? menu, the Help menu or Settings.
 */
export function TourProvider({ children }) {
  const { state, applyRemote, loadError } = useStore();
  const [page] = useHashRoute();
  const route = page || 'planner';
  const [active, setActive] = useState(null); // { id, index, dir }
  const [offer, setOffer] = useState(null); // page tour offered on this page
  const user = state ? currentUser(state) : null;
  const ready = Boolean(state && !loadError && !PAGES_WITHOUT_TOURS.has(route) && !disabled());

  // Kept with the teacher's planner (and in every undo step, so Undo never
  // brings a finished tour back).
  const record = useCallback((id, how) => applyRemote((d) => markTour(currentUser(d), id, how)), [applyRemote]);
  const start = useCallback((id) => { setOffer(null); setActive({ id, index: 0, dir: 1 }); }, []);

  // First launch: open with the welcome step, which asks before touring.
  const offeredStart = useRef(false);
  useEffect(() => {
    if (!ready || offeredStart.current || active) return;
    offeredStart.current = true;
    if (shouldOfferStart(user)) start('start');
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // First visit to a page: a small, non-blocking offer.
  useEffect(() => {
    setOffer(null);
    if (!ready || active || !shouldOfferPage(user, route)) return;
    setOffer(route);
    record(route, 'offered');
  }, [route, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback((how) => {
    setActive((a) => { if (a) record(a.id, how); return null; });
  }, [record]);

  const value = { start, pageTour: pageTourFor(route), active: Boolean(active) };
  return (
    <TourContext.Provider value={value}>
      {children}
      {ready && active && (
        <TourStep
          key={`${active.id}-${active.index}`}
          tour={TOURS[active.id]}
          tourId={active.id}
          index={active.index}
          dir={active.dir}
          route={route}
          go={(index, dir) => setActive((a) => a && ({ ...a, index, dir }))}
          finish={finish}
        />
      )}
      {ready && !active && offer && (
        <div className="tour-offer no-print" role="status">
          <span>First time on <strong>{TOURS[offer].title}</strong>? Take a quick tour.</span>
          <div className="row">
            <button className="primary" onClick={() => start(offer)}>Show me around</button>
            <button onClick={() => setOffer(null)}>No thanks</button>
          </div>
        </div>
      )}
    </TourContext.Provider>
  );
}

const visible = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const findTarget = (target) => {
  for (const sel of [].concat(target || [])) {
    const el = [...document.querySelectorAll(sel)].find(visible);
    if (el) return el;
  }
  return null;
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function TourStep({ tour, tourId, index, dir, route, go, finish }) {
  const step = tour.steps[index];
  const count = tour.steps.length;
  const last = index === count - 1;
  const welcome = tourId === 'start' && index === 0;
  const [target, setTarget] = useState(null); // element, or false when there isn't one
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const box = useRef();
  const nextBtn = useRef();
  const nudged = useRef(false);

  // Go to the step's page, then wait briefly for what it highlights.
  useEffect(() => {
    if (step.route && step.route !== route) { navigate(step.route); return undefined; }
    if (!step.target) { setTarget(false); return undefined; }
    let tries = 0;
    const timer = setInterval(() => {
      const el = findTarget(step.target);
      tries += 1;
      if (el || tries > 15) {
        clearInterval(timer);
        if (el) setTarget(el);
        else if (step.optional) {
          // Not on screen (e.g. no lessons yet): skip it, in the direction we were going.
          const next = index + dir;
          if (next >= 0 && next < count) go(next, dir); else finish('done');
        } else setTarget(false);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [step, route]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring it into view and follow it as the window scrolls or resizes.
  useEffect(() => {
    if (!target) { setRect(null); return undefined; }
    const r0 = target.getBoundingClientRect();
    const behavior = reducedMotion() ? 'auto' : 'smooth';
    if (r0.height > window.innerHeight * 0.6) {
      // Taller than most of the window: show its top, just below the header.
      const header = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
      if (r0.top < header + 8 || r0.top > window.innerHeight * 0.4) window.scrollBy({ top: r0.top - header - 16, behavior });
    } else if (r0.top < 60 || r0.bottom > window.innerHeight - 40) target.scrollIntoView({ block: 'center', behavior });
    let frame;
    const measure = () => {
      const r = target.getBoundingClientRect();
      setRect((old) => (old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height ? old : r));
    };
    const loop = () => { measure(); frame = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // Place the box next to it once both sizes are known.
  useLayoutEffect(() => {
    if (target === null || !box.current) return;
    const b = box.current.getBoundingClientRect();
    const spot = rect && { top: rect.top - 6, left: rect.left - 6, bottom: rect.bottom + 6, right: rect.right + 6, width: rect.width + 12, height: rect.height + 12 };
    const placed = placeBox(spot, { width: b.width, height: b.height }, window.innerWidth, window.innerHeight);
    // No room above or below where it sits now, but the highlight and the box
    // fit on screen together: scroll it up once so the box goes underneath.
    const header = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    if (placed.placement === 'inside' && !nudged.current && spot.height + b.height + 40 <= window.innerHeight - header) {
      nudged.current = true;
      window.scrollBy({ top: spot.top - header - 12, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    setPos(placed);
  }, [rect, target]);

  useEffect(() => { if (pos) nextBtn.current?.focus({ preventScroll: true }); }, [pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => go(index - 1, -1);
  const next = () => (last ? finish('done') : go(index + 1, 1));
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish('skipped'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); back(); }
    else if (e.key === 'Tab') {
      // keep keyboard focus inside the tour box
      const items = [...box.current.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items.at(-1).focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  };

  if (target === null) return null; // still finding it (usually a fraction of a second)
  const pad = 6;
  return createPortal(
    <div className="tour-layer no-print" onKeyDown={onKeyDown}>
      {/* Blocks clicks on the page while the tour is open. */}
      <div className={`tour-blocker ${rect ? '' : 'tour-dim'}`} onMouseDown={(e) => e.preventDefault()} />
      {rect && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <div
        ref={box}
        className={`tour-box ${welcome ? 'tour-welcome' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
      >
        <button className="icon-btn tour-close" aria-label="Close tour" onClick={() => finish('skipped')}>✕</button>
        {!welcome && <div className="tour-count small muted">{tour.title} · {index + 1} of {count}</div>}
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">{tour.steps.map((s, i) => <span key={i} className={i === index ? 'on' : ''} />)}</div>
        <div className="row tour-actions">
          {welcome ? (
            <>
              <button onClick={() => finish('skipped')}>Not now</button>
              <span className="grow" />
              <button ref={nextBtn} className="primary" onClick={next}>Show me around</button>
            </>
          ) : (
            <>
              {!last && <button className="link-btn" onClick={() => finish('skipped')}>Skip tour</button>}
              <span className="grow" />
              {index > 0 && <button onClick={back}>Back</button>}
              <button ref={nextBtn} className="primary" onClick={next}>{last ? 'Done' : 'Next'}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
