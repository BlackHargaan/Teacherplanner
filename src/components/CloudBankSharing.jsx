import { useState } from 'react';
import { useCloud } from '../lib/cloud/CloudProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { SignInForm } from './CloudAccount.jsx';

const ROLE_LABEL = { view: 'Can view', edit: 'Can edit' };

/** Sharing tab for a lesson bank: online sharing with teammates. */
export default function CloudBankSharing({ bank, isLocalOwner }) {
  const cloud = useCloud();
  const { notify } = useStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('view');
  const [busy, setBusy] = useState(false);
  if (!cloud.configured) return null;

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okText) notify(typeof okText === 'function' ? okText(r) : okText);
    } catch (err) {
      notify(String(err?.message || 'That didn’t work. Check your internet connection and try again.'), true);
    } finally {
      setBusy(false);
    }
  };

  // Not shared online yet
  if (!bank.cloud) {
    if (!isLocalOwner) return null;
    return (
      <section className="card cloud-card">
        <h3>Share online with your team</h3>
        <p className="small">Teachers you invite can use this bank from their own computers and link its lessons into their classes. Only the bank’s lessons go online — never rosters, grades or your private notes. Files attached from this computer stay here; links work for everyone.</p>
        {!cloud.user
          ? <SignInForm />
          : <button className="primary" disabled={busy} onClick={() => run(() => cloud.publishBank(bank.id), 'Shared online. Now invite your teammates.')}>Share this bank online</button>}
      </section>
    );
  }

  if (bank.cloud.revoked) {
    return (
      <section className="card cloud-card notice-card">
        <h3>No longer shared with you</h3>
        <p className="small">This bank was removed or you no longer have access. Your copy is read-only. Lessons you linked into your classes stay there.</p>
        <button className="danger" onClick={() => run(() => cloud.leaveBank(bank.id, { alreadyGone: true }), 'Removed from your planner')}>Remove from my planner</button>
      </section>
    );
  }

  const owner = bank.cloud.role === 'owner';
  return (
    <section className="card cloud-card">
      <h3>Shared online</h3>
      {!cloud.user && (
        <div className="notice small">You’re signed out, so changes to this bank aren’t syncing. <a href="#/settings/account">Sign in</a></div>
      )}
      <ul className="list member-list">
        <li>
          <span className="grow"><strong>{owner ? 'You' : bank.cloud.ownerName}</strong></span>
          <span className="badge">Owner</span>
        </li>
        {bank.cloud.members.map((m) => (
          <li key={m.userId}>
            <span className="grow">
              <strong>{m.userId === cloud.user?.id ? 'You' : m.name}</strong>
              {m.email && m.name !== m.email && <span className="small muted"> {m.email}</span>}
            </span>
            {owner ? (
              <>
                <select aria-label={`Access for ${m.name}`} value={m.role} disabled={busy} onChange={(e) => run(() => cloud.setMemberRole(bank.id, m.userId, e.target.value), 'Access updated')}>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button className="icon-btn" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => {
                  if (window.confirm(`Remove ${m.name} from “${bank.name}”? They keep the lessons already linked into their classes.`)) run(() => cloud.removeMember(bank.id, m.userId), 'Removed');
                }}>✕</button>
              </>
            ) : <span className="badge">{ROLE_LABEL[m.role]}</span>}
          </li>
        ))}
        {bank.cloud.invites.map((i) => (
          <li key={i.email}>
            <span className="grow">{i.email} <span className="small muted">— invited, joins next time they open Teacher Planner signed in with this email</span></span>
            <span className="badge">{ROLE_LABEL[i.role]}</span>
            {owner && <button className="icon-btn" aria-label={`Cancel invitation for ${i.email}`} disabled={busy} onClick={() => run(() => cloud.cancelInvite(bank.id, i.email), 'Invitation cancelled')}>✕</button>}
          </li>
        ))}
      </ul>

      {owner && cloud.user && (
        <form className="row wrap invite-form" onSubmit={(e) => {
          e.preventDefault();
          const to = email.trim();
          run(() => cloud.invite(bank.id, to, role), (r) => (r === 'updated' ? `${to}’s access changed` : `Invitation saved — ${to} gets this bank next time they open Teacher Planner signed in with that email`));
          setEmail('');
        }}>
          <input type="email" required placeholder="teammate@school.org" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Teammate’s email" className="grow" />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access">
            <option value="view">Can view</option>
            <option value="edit">Can edit</option>
          </select>
          <button className="primary" disabled={busy || !email.includes('@')}>Invite</button>
        </form>
      )}
      {owner && <p className="small muted">Teammates don’t get an email from us yet — let them know to sign in to Teacher Planner with the address you invited.</p>}

      <div className="row wrap">
        {owner && cloud.user && (
          <button className="danger" disabled={busy} onClick={() => {
            if (window.confirm(`Stop sharing “${bank.name}” online? It disappears for everyone you shared it with (lessons they linked into classes stay). Your copy stays on this computer.`)) run(() => cloud.unpublishBank(bank.id));
          }}>Stop sharing online</button>
        )}
        {!owner && cloud.user && (
          <button className="danger" disabled={busy} onClick={() => {
            if (window.confirm(`Leave “${bank.name}”? Lessons you linked into your classes stay.`)) run(() => cloud.leaveBank(bank.id), 'You left the bank');
          }}>Leave this bank</button>
        )}
      </div>
    </section>
  );
}
