import { useEffect, useState } from 'react';
import { useCloud } from '../lib/cloud/CloudProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { Field } from './ui.jsx';

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
          <p className="small">Sign in to share lesson banks with your team. Only lesson banks you choose to share go online — rosters, grades, student notes and your private lesson notes always stay on this computer.</p>
          <SignInForm onSignedIn={() => notify('Signed in. Your shared lesson banks will appear under Collaborate.')} />
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
        </>
      )}
    </section>
  );
}

/** Small indicator in the top bar. */
export function CloudStatus() {
  const cloud = useCloud();
  if (!cloud.configured) return null;
  const label = cloud.user ? (cloud.pending && !['offline', 'error'].includes(cloud.status) ? 'Saving…' : STATUS_TEXT[cloud.status]) : 'Sign in';
  return (
    <a className={`cloud-pill sync-${cloud.user ? cloud.status : 'signed-out'}`} href="#/settings/account" title={cloud.user ? `Online sharing: ${STATUS_TEXT[cloud.status]}` : 'Sign in to share lesson banks with your team'}>
      <span aria-hidden="true">☁</span> {cloud.user ? (cloud.status === 'synced' && !cloud.pending ? 'Synced' : label) : 'Sign in'}
    </a>
  );
}
