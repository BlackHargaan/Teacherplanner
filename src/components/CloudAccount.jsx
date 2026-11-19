import { useEffect, useState } from 'react';
import { useCloud } from '../lib/cloud/CloudProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { Field, Modal } from './ui.jsx';
import { host } from '../lib/store.jsx';
import { exportBackup } from '../lib/backup.js';

const friendly = (err) => {
  const msg = String(err?.message || err || '');
  if (/rate limit|too many|security purposes/i.test(msg)) return 'Too many codes were requested. Wait a minute, then try again.';
  if (/expired|invalid|token/i.test(msg)) return 'That code didn’t work. Check it, or send a new one.';
  if (/fetch|network/i.test(msg)) return 'Couldn’t reach the internet. Check your connection and try again.';
  return msg || 'Something went wrong. Please try again.';
};

/** Email → one-time code sign-in. No passwords, no browser redirects. */
export function SignInForm({ onSignedIn }) {
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      await cloud.sendCode(email);
      setStep('code');
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await cloud.verifyCode(email, code);
      onSignedIn?.();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  return step === 'email' ? (
    <form className="signin" onSubmit={send}>
      <Field label="Your school email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.org" />
      </Field>
      <button className="primary" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
      {error && <p className="small error-text" role="alert">{error}</p>}
      <p className="small muted">No password needed. If you don’t have an account yet, this creates one.</p>
    </form>
  ) : (
    <form className="signin" onSubmit={verify}>
      <p className="small">We emailed a sign-in code to <strong>{email}</strong>. It may take a minute — check spam if you don’t see it.</p>
      <Field label="Sign-in code">
        <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345678" maxLength={10} />
      </Field>
      <div className="row wrap">
        <button className="primary" disabled={busy || code.replace(/\D/g, '').length < 6}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="link-btn small" onClick={() => { setStep('email'); setCode(''); setError(''); }}>Use a different email</button>
        <button type="button" className="link-btn small" disabled={busy} onClick={send}>Send a new code</button>
      </div>
      {error && <p className="small error-text" role="alert">{error}</p>}
    </form>
  );
}

const ago = (ts) => {
  if (!ts) return 'not yet';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
};

export const STATUS_TEXT = {
  starting: 'Connecting…',
  'signed-out': 'Not signed in',
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline — will sync when you’re back online',
  error: 'Sync problem',
};

/** Settings → Online account */
export function AccountCard() {
  const cloud = useCloud();
  const { notify } = useStore();
  const [name, setName] = useState('');
  useEffect(() => { setName(cloud.user?.user_metadata?.display_name || ''); }, [cloud.user?.id]);
  if (!cloud.configured) return null;

  return (
    <section className="card" id="account">
      <h2>Online account</h2>
      {!cloud.user ? (
        <>
          <p className="small">Sign in to save your plans online, so they’re on every computer you use, and to share lesson banks with your team. Student names, grades, seating charts and student notes always stay on this computer.</p>
          <SignInForm onSignedIn={() => notify(host ? 'Signed in. Your shared lesson banks will appear under Collaborate.' : 'Signed in. Turn on “Save my plans online” below to keep your plans safe in your account.')} />
        </>
      ) : (
        <>
          <p className="small">Signed in as <strong>{cloud.email}</strong></p>
          <Field label="Name your teammates see">
            <div className="row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ms. Rivera" className="grow" />
              <button onClick={async () => {
                try { await cloud.setDisplayName(name.trim()); notify('Name saved'); } catch { notify('Could not save your name.', true); }
              }}>Save</button>
            </div>
          </Field>
          <p className="small" role="status">
            <span className={`dot sync-${cloud.status}`} /> {STATUS_TEXT[cloud.status] || ''} · last synced {ago(cloud.lastSync)}
          </p>
          {cloud.error && <p className="small error-text">{cloud.error}</p>}
          <div className="row wrap">
            <button onClick={() => cloud.syncNow()} disabled={cloud.status === 'syncing'}>Sync now</button>
            <button onClick={() => cloud.signOut()}>Sign out</button>
          </div>
          <SavingOnline />
        </>
      )}
    </section>
  );
}

/** What goes online when saving is on, and what never does. */
function WhatGoesOnline() {
  return (
    <div className="online-split small">
      <div>
        <strong>Saved online</strong>
        <p className="muted">School years and calendars, classes and their schedules, lessons (including your private lesson notes), templates, lesson banks, views, and gradebook categories and assignment names.</p>
      </div>
      <div>
        <strong>Stays on this computer</strong>
        <p className="muted">Student names and rosters, student notes, grades and standards scores, who sits where, notes to and from substitutes, and files stored inside lessons (links to Google Drive travel).</p>
      </div>
    </div>
  );
}

function SavingOnline() {
  const cloud = useCloud();
  const { state, notify } = useStore();
  const [stopping, setStopping] = useState(false);
  return (
    <div className="saving-online" id="save-online">
      <h3>Save my plans online</h3>
      {cloud.savingOnline ? (
        <>
          <p className="small"><span className="dot sync-synced" /> On. Your plans are saved to <strong>{cloud.email}</strong> as you work, and sign-in on another computer or browser brings them along.</p>
          <WhatGoesOnline />
          <p className="small muted">To bring student information to another computer, use <strong>Export backup</strong> on this one and <strong>Import student information</strong> on the other (both under Settings → Data).</p>
          <button onClick={() => setStopping(true)}>Stop saving online…</button>
        </>
      ) : (
        <>
          <p className="small">Keep your plans in your account, so they’re safe if this computer or browser is lost or cleared, and open them anywhere you sign in.</p>
          <WhatGoesOnline />
          <button className="primary" onClick={() => cloud.startSavingOnline().catch(() => notify('Couldn’t reach your account. Try again in a moment.', true))}>Save my plans online</button>
        </>
      )}
      {stopping && (
        <Modal
          title="Stop saving online?"
          onClose={() => setStopping(false)}
          footer={(
            <>
              <button onClick={() => setStopping(false)}>Cancel</button>
              <button onClick={async () => { setStopping(false); await cloud.stopSavingOnline(); notify('Your plans are no longer saved online from this computer.'); }}>Stop, keep the online copy</button>
              <button className="danger" onClick={async () => {
                setStopping(false);
                try { await cloud.stopSavingOnline({ deleteOnline: true }); notify('Your online copy was deleted. Your planner is still on this computer.'); } catch { notify('Couldn’t reach your account to delete it. Try again.', true); }
              }}>Stop and delete the online copy</button>
            </>
          )}
        >
          <p>Your planner stays on this computer either way. Keep the online copy if you use other computers that still save to it.</p>
          {state && <p className="small muted">Deleting removes your plans from your account for good, on every computer, but not from any computer’s own planner.</p>}
        </Modal>
      )}
    </div>
  );
}

/**
 * First time this computer saves online to an account that already has a
 * planner: use that one, or replace it with this computer's.
 */
export function PlannerChoiceDialog() {
  const cloud = useCloud();
  const { state, applyRemote } = useStore();
  if (!cloud.plannerChoice || !state) return null;
  const online = cloud.plannerChoice.rows.filter((r) => !r.deleted);
  const count = (kind, list) => list.filter((r) => r.kind === kind).length;
  const onlineClasses = count('class', online);
  const onlineLessons = count('lesson', online);
  return (
    <Modal
      title="Your account already has a planner"
      onClose={() => cloud.resolvePlannerChoice('cancel')}
      footer={(
        <>
          <button onClick={() => cloud.resolvePlannerChoice('cancel')}>Not now</button>
          <button onClick={() => {
            if (window.confirm('Replace the planner saved in your account with this computer’s? Your other computers will switch to this one too.')) cloud.resolvePlannerChoice('mine');
          }}>Replace it with this computer’s</button>
          <button className="primary" onClick={() => {
            exportBackup(state, applyRemote); // this computer's planner, just in case
            cloud.resolvePlannerChoice('online');
          }}>Use the planner from my account</button>
        </>
      )}
    >
      <p>Your account has <strong>{onlineClasses} {onlineClasses === 1 ? 'class' : 'classes'}</strong> and <strong>{onlineLessons} {onlineLessons === 1 ? 'lesson' : 'lessons'}</strong> saved online. This computer has <strong>{state.classes.length} {state.classes.length === 1 ? 'class' : 'classes'}</strong> and <strong>{Object.keys(state.lessons).length} lessons</strong>.</p>
      <p><strong>Use the planner from my account</strong> (usually right): this computer switches to it. A backup of this computer’s planner downloads first, and student information for classes in both stays.</p>
      <p className="small muted">Replacing makes this computer’s planner the one in your account, on every computer.</p>
    </Modal>
  );
}

/** Small indicator in the top bar. */
export function CloudStatus() {
  const cloud = useCloud();
  if (!cloud.configured) return null;
  const label = cloud.user ? (cloud.pending && !['offline', 'error'].includes(cloud.status) ? 'Saving…' : STATUS_TEXT[cloud.status]) : 'Sign in';
  return (
    <a className={`cloud-pill sync-${cloud.user ? cloud.status : 'signed-out'}`} href="#/settings/account" title={cloud.user ? `Online: ${STATUS_TEXT[cloud.status]}` : 'Sign in to save your plans online and share lesson banks'}>
      <span aria-hidden="true">☁</span> {cloud.user ? (cloud.status === 'synced' && !cloud.pending ? 'Synced' : label) : 'Sign in'}
    </a>
  );
}
