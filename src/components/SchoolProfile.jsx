import { useState } from 'react';
import { useCloud } from '../lib/cloud/CloudProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { formatJoinCode } from '../lib/cloud/schoolSync.js';
import { Field, Modal } from './ui.jsx';

const ROLE = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/**
 * Schedule page → School profile. One teacher shares the school's calendar
 * and bell schedule; colleagues join with a code and get it, kept up to date.
 */
export default function SchoolProfile({ year }) {
  const cloud = useCloud();
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [confirmJoin, setConfirmJoin] = useState(false);
  if (!cloud.configured) return null;
  const school = year.school;

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) notify(typeof ok === 'function' ? ok(r) : ok);
      return true;
    } catch (err) {
      notify(String(err?.message || 'That didn’t work. Check your internet connection and try again.'), true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.user) {
    return (
      <section className="card wide school-card">
        <h2>School profile</h2>
        <p className="small">Set up your school’s calendar and bell schedule once and share it, so colleagues don’t have to enter it themselves. <a href="#/settings/account">Sign in</a> to share or join one.</p>
      </section>
    );
  }

  if (!school) {
    return (
      <section className="card wide school-card">
        <h2>School profile</h2>
        <p className="small muted">Share this year’s calendar, days off, bell schedule, grading periods and early-release schedules with colleagues, or join one a colleague shared. Classes, lessons and grades always stay your own. People in a school can see each other’s names and email addresses.</p>
        <div className="school-choices">
          <form className="subcard" onSubmit={(e) => { e.preventDefault(); run(() => cloud.createSchool(year.id, name.trim()), (c) => `Shared. Colleagues can join with code ${formatJoinCode(c)}.`); }}>
            <h3>Share this schedule with your school</h3>
            <Field label="School name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greene County Intermediate" maxLength={200} /></Field>
            <button className="primary" disabled={busy || !name.trim()}>Share and get a join code</button>
          </form>
          <form className="subcard" onSubmit={(e) => { e.preventDefault(); setConfirmJoin(true); }}>
            <h3>Join your school</h3>
            <Field label="Join code" hint="Ask the colleague who shared it."><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={12} autoComplete="off" /></Field>
            <button disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}>Join…</button>
          </form>
        </div>
        {confirmJoin && (
          <Modal
            title="Join your school?"
            onClose={() => setConfirmJoin(false)}
            footer={(
              <>
                <span className="grow" />
                <button onClick={() => setConfirmJoin(false)}>Cancel</button>
                <button className="primary" disabled={busy} onClick={async () => {
                  // Close either way: after a wrong code the teacher fixes it in the field behind.
                  if (await run(() => cloud.joinSchool(year.id, code), 'Joined. Your calendar and bell schedule now come from your school.')) setCode('');
                  setConfirmJoin(false);
                }}>Join</button>
              </>
            )}
          >
            <p>For <strong>{year.name}</strong>, your school’s profile replaces your:</p>
            <ul className="small">
              <li>first and last day, school days and schedule type</li>
              <li>days off, breaks and cancelled days</li>
              <li>bell schedule and grading periods</li>
              <li>early-release schedules</li>
            </ul>
            <p className="small">Your classes, lessons, grades and seating charts don’t change. Classes stay in their periods when the period names match.</p>
          </Modal>
        )}
      </section>
    );
  }

  if (school.revoked) {
    return (
      <section className="card wide school-card notice-card">
        <h2>School profile</h2>
        <p className="small">{school.name || 'This school'} was deleted, or you were removed from it. Your copy of the calendar and bell schedule stays, and it’s yours to edit now.</p>
        <button disabled={busy} onClick={() => run(() => cloud.leaveSchool(year.id), 'Your schedule is your own now.')}>OK</button>
      </section>
    );
  }

  const isOwner = school.role === 'owner';
  const canManage = isOwner || school.role === 'admin';
  const copy = () => navigator.clipboard?.writeText(formatJoinCode(school.joinCode)).then(() => notify('Join code copied'), () => notify(formatJoinCode(school.joinCode)));

  return (
    <section className="card wide school-card">
      <div className="row wrap">
        <h2 className="grow">School profile: {school.name || '…'}</h2>
        <span className="badge">{ROLE[school.role] || 'Member'}</span>
      </div>
      {!school.seen ? (
        <p className="small muted" role="status">Getting your school’s schedule…</p>
      ) : canManage ? (
        <p className="small">Changes you make to the calendar, days off, bell schedule, grading periods and shared early-release schedules below go to everyone in {school.name}.</p>
      ) : (
        <p className="small">Your calendar, days off, bell schedule, grading periods and early-release schedules come from {school.name}{school.ownerName ? `, managed by ${school.ownerName}` : ''}. They update automatically. Which class meets in which period is still up to you.</p>
      )}

      {school.joinCode && (
        <div className="row wrap join-code">
          <span className="small muted">Join code</span>
          <code aria-label="Join code">{formatJoinCode(school.joinCode)}</code>
          <button type="button" onClick={copy}>Copy</button>
          {canManage && (
            <button type="button" disabled={busy} onClick={() => {
              if (window.confirm('Make a new join code? The old one stops working; people who already joined stay.')) run(() => cloud.newJoinCode(year.id), 'New join code ready');
            }}>New code</button>
          )}
          <span className="small muted">Colleagues enter it under Schedule → School profile.</span>
        </div>
      )}

      {school.seen && (
        <details className="school-members">
          <summary>{(school.members || []).length + 1} {(school.members || []).length ? 'people' : 'person'} in {school.name}</summary>
          <p className="small muted">Everyone in the school can see each other’s names and email addresses.</p>
          <ul className="list member-list">
            <li><span className="grow"><strong>{isOwner ? 'You' : school.ownerName}</strong></span><span className="badge">Owner</span></li>
            {(school.members || []).map((m) => (
              <li key={m.userId}>
                <span className="grow"><strong>{m.userId === cloud.user.id ? 'You' : m.name}</strong>{m.email && m.email !== m.name && <span className="small muted"> {m.email}</span>}</span>
                {isOwner ? (
                  <select aria-label={`Role for ${m.name}`} value={m.role} disabled={busy} onChange={(e) => run(() => cloud.setSchoolRole(year.id, m.userId, e.target.value), 'Role updated')}>
                    <option value="member">Member</option>
                    <option value="admin">Admin (can edit)</option>
                  </select>
                ) : <span className="badge">{ROLE[m.role]}</span>}
                {canManage && m.userId !== cloud.user.id && (
                  <button className="icon-btn" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => {
                    if (window.confirm(`Remove ${m.name} from ${school.name}? They keep their copy of the schedule.`)) run(() => cloud.removeSchoolMember(year.id, m.userId), 'Removed');
                  }}>✕</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="row wrap">
        {isOwner ? (
          <button className="danger" disabled={busy} onClick={() => {
            if (window.confirm(`Delete ${school.name} for everyone? Colleagues keep their copy of the schedule, but it stops updating. This can’t be undone.`)) run(() => cloud.deleteSchool(year.id), 'School profile deleted. Your schedule stays.');
          }}>Delete school profile</button>
        ) : (
          <button className="danger" disabled={busy} onClick={() => {
            if (window.confirm(`Leave ${school.name}? Your copy of the schedule stays, but it stops updating.`)) run(() => cloud.leaveSchool(year.id), 'You left the school. Your schedule stays.');
          }}>Leave school</button>
        )}
      </div>
    </section>
  );
}
