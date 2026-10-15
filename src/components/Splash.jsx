import { useEffect, useState } from 'react';

// Shown once as the app opens: the logo draws itself, then fades into the app.
// Skipped for shared views and print pages, when the computer asks for reduced
// motion, and when automated tests turn it off.
const skip = () => {
  if (/^#\/(view|print)\b/.test(window.location.hash)) return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  try { return localStorage.getItem('teacher-planner:splash') === 'off'; } catch { return false; }
};

const HOLD = 1500; // the drawing finishes at about 1.3s
const FADE = 350;

export function Splash() {
  const [stage, setStage] = useState(() => (skip() ? 'gone' : 'show'));
  useEffect(() => {
    if (stage !== 'show') return undefined;
    const t = setTimeout(() => setStage('fade'), HOLD);
    return () => clearTimeout(t);
  }, [stage]);
  useEffect(() => {
    if (stage !== 'fade') return undefined;
    const t = setTimeout(() => setStage('gone'), FADE);
    return () => clearTimeout(t);
  }, [stage]);
  if (stage === 'gone') return null;
  return (
    <div className={`tp-splash ${stage === 'fade' ? 'tp-splash-out' : ''}`} aria-hidden="true" onPointerDown={() => setStage('fade')}>
      <svg viewBox="0 0 400 400" width="220" height="220" className="tp-logo-svg">
        <rect className="tp-outer" x="40" y="40" width="320" height="320" rx="84" fill="#4a705a" />
        <rect className="tp-inner" x="102" y="102" width="196" height="196" rx="52" fill="#f2f4f1" />
        <path className="tp-stroke tp-t-stem" d="M 167 139 L 167 210" fill="none" stroke="#3c634d" strokeWidth="15.5" />
        <path className="tp-stroke tp-t-cross" d="M 149 161 L 184 161" fill="none" stroke="#3c634d" strokeWidth="14" />
        <path className="tp-stroke tp-p-stem" d="M 199 154 L 199 235" fill="none" stroke="#3c634d" strokeWidth="15.5" />
        <path className="tp-stroke tp-p-bowl" d="M 199 169 C 206 157, 222 155, 234 162 C 246 169, 249 195, 234 204 C 222 211, 206 209, 199 197" fill="none" stroke="#3c634d" strokeWidth="15" strokeLinecap="round" />
        <rect className="tp-underline" x="134" y="243" width="132" height="19" rx="9.5" fill="#3c634d" />
      </svg>
    </div>
  );
}
