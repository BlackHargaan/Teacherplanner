// Online account + background sync of team lesson banks and school profiles.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { cloudConfigured } from './config.js';
import * as api from './backend.js';
import { applySnapshot, changesByBank, changesToPush, detachBank, fingerprint, markPushed } from './sync.js';
import { deleteBankLocally } from '../actions.js';
import { uid } from '../model.js';
import {
  applySchools, makeJoinCode, markSchoolsPushed, markSharedDayTypes, schoolData, schoolsToPush, unlinkSchool,
} from './schoolSync.js';

const CloudContext = createContext({ configured: false });
const SYNC_EVERY_MS = 2 * 60 * 1000;
const PUSH_DELAY_MS = 1500;
const CHECK_DELAY_MS = 400;
const MAX_ROUNDS = 3;

const hasChanges = (ch) => ch.banks.length + ch.lessons.length + ch.deletes.length > 0;
const anythingToPush = (state) => hasChanges(changesToPush(state)) || schoolsToPush(state).length > 0;

export function CloudProvider({ children }) {
  const { state, applyRemote, latest, notify } = useStore();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(cloudConfigured ? 'starting' : 'off'); // off | starting | signed-out | syncing | synced | offline | error
  const [error, setError] = useState(null);
  const running = useRef(false);
  const lastSnap = useRef(null);
  const again = useRef(false);
  const user = session?.user || null;

  // ---- session
  useEffect(() => {
    if (!cloudConfigured) return undefined;
    api.getSession().then((s) => { setSession(s); if (!s) setStatus('signed-out'); }).catch(() => setStatus('offline'));
    return api.onAuthChange((s) => { setSession(s); if (!s) setStatus('signed-out'); });
  }, []);

  // ---- one sync round: pull everything, then push local edits. Pulling
  // first means roles, removals, deletions and a change of account are known
  // before anything is uploaded (unsent local edits are kept by the merge).
  const sync = useCallback(async () => {
    if (!user || !latest.current) return;
    if (running.current) { again.current = true; return; }
    running.current = true;
    setStatus('syncing');
    try {
      let refused = null;
      let rounds = 0;
      do {
        again.current = false;
        rounds += 1;
        refused = null;
        await api.acceptInvites().catch(() => {}); // banks teammates invited this email to
        const snap = await api.fetchSnapshot(user.id);
        // Teammates' changes also go into undo history (see applyRemote);
        // skip that work when nothing online changed since the last pull.
        const snapPrint = fingerprint(snap);
        applyRemote((d) => { applySnapshot(d, snap, d.currentUserId); applySchools(d, snap); }, { history: snapPrint !== lastSnap.current });
        lastSnap.current = snapPrint;

        // One bank at a time, so one that's refused doesn't hold up the rest.
        for (const group of changesByBank(latest.current, changesToPush(latest.current))) {
          try {
            await api.pushChanges(group);
            applyRemote((d) => markPushed(d, group));
          } catch (err) {
            if (!api.isRefused(err)) throw err;
            refused = err; // access changed since the pull: the next one sorts it out
            again.current = true;
          }
        }
        const schools = schoolsToPush(latest.current);
        if (schools.length) {
          const done = await api.pushSchools(schools);
          applyRemote((d) => markSchoolsPushed(d, done));
          if (done.length < schools.length) again.current = true; // changed online meanwhile: merge, then retry
        }
      } while (again.current && rounds < MAX_ROUNDS);
      if (refused) throw refused;
      setError(null);
      setStatus('synced');
    } catch (err) {
      setError(api.isOffline(err) ? null : String(err.message || err));
      setStatus(api.isOffline(err) ? 'offline' : 'error');
    } finally {
      running.current = false;
    }
  }, [user, applyRemote, latest]);

  // ---- when to sync
  const plannerLoaded = !!state;
  useEffect(() => {
    if (!user || !plannerLoaded) return undefined;
    sync();
    const timer = setInterval(sync, SYNC_EVERY_MS);
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    let debounce;
    const unsubscribe = api.subscribe(() => { clearTimeout(debounce); debounce = setTimeout(sync, 800); });
    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      unsubscribe();
    };
  }, [user?.id, plannerLoaded, sync]);

  // Push soon after local edits to a shared bank. Checking means
  // fingerprinting every shared lesson, so wait for a pause in typing rather
  // than doing it on every keystroke.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!user || !state) { setPending(false); return undefined; }
    const t = setTimeout(() => setPending(anythingToPush(latest.current)), CHECK_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, user, latest]);
  useEffect(() => {
    if (!pending) return undefined;
    const t = setTimeout(sync, PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [pending, state, sync]);

  // ---- actions used by the UI
  const actions = useMemo(() => ({
    sendCode: (email) => api.sendCode(email),
    verifyCode: async (email, code) => {
      const s = await api.verifyCode(email, code);
      setSession(s);
      return s;
    },
    signOut: async () => {
      await api.signOut();
      setSession(null);
      setStatus('signed-out');
    },
    setDisplayName: async (name) => {
      const updated = await api.setDisplayName(user.id, name);
      if (updated) setSession((s) => (s ? { ...s, user: updated } : s));
    },
    syncNow: sync,

    /** Share a local bank online (the signed-in teacher becomes its owner). */
    publishBank: async (bankId) => {
      applyRemote((d) => {
        const bank = d.banks.find((b) => b.id === bankId);
        bank.ownerId = d.currentUserId;
        bank.sharing = {};
        bank.cloud = { role: 'owner', members: [], invites: [] };
        d.cloud ||= { shadow: {} };
        d.cloud.userId ||= user.id;
      });
      await sync();
    },
    /** Stop sharing online: deletes it for everyone; your copy becomes local. */
    unpublishBank: async (bankId) => {
      await api.deleteBank(bankId);
      applyRemote((d) => detachBank(d, bankId, d.currentUserId));
      notify('This bank is no longer shared online. Your copy is kept on this computer.');
    },
    /** Leave a bank someone shared with you (or drop one you've lost access to). */
    leaveBank: async (bankId, { alreadyGone = false } = {}) => {
      if (!alreadyGone) {
        await api.removeMember(bankId, user.id);
      }
      applyRemote((d) => {
        deleteBankLocally(d, bankId, d.currentUserId);
        for (const key of Object.keys(d.cloud?.shadow || {})) {
          if (key === `b:${bankId}` || key.startsWith(`l:${bankId}:`)) delete d.cloud.shadow[key];
        }
      });
    },
    invite: async (bankId, email, role) => {
      const result = await api.invite(bankId, email, role);
      await sync();
      return result;
    },
    setMemberRole: async (bankId, userId, role) => { await api.setMemberRole(bankId, userId, role); await sync(); },
    removeMember: async (bankId, userId) => { await api.removeMember(bankId, userId); await sync(); },
    cancelInvite: async (bankId, email) => { await api.cancelInvite(bankId, email); await sync(); },

    // ---- school profiles (one per school year)
    /** Share this year's calendar and bell schedule; the teacher becomes its owner. */
    createSchool: async (yearId, name) => {
      // Worked out on a copy: nothing changes here unless the upload succeeds.
      const copy = structuredClone(latest.current.years.find((y) => y.id === yearId));
      markSharedDayTypes(copy);
      const data = schoolData(copy);
      const id = uid('school');
      const row = await api.createSchool({ id, name, data }, makeJoinCode);
      const sent = { name: row.name, data };
      applyRemote((d) => {
        const y = d.years.find((x) => x.id === yearId);
        markSharedDayTypes(y);
        // Not marked seen until a download includes it, so a sync that was
        // already under way can't mistake it for a deleted school.
        y.school = {
          id, name: row.name, role: 'owner', joinCode: row.join_code, ownerId: row.owner_id, members: [],
          updatedAt: row.updated_at, base: structuredClone(sent), shadow: fingerprint(sent),
        };
      });
      sync();
      return row.join_code;
    },
    /** Join with a code: this year's school schedule comes from that school from now on. */
    joinSchool: async (yearId, code) => {
      const id = await api.joinSchool(code);
      const other = latest.current.years.find((y) => y.school?.id === id && y.id !== yearId);
      if (other) throw new Error(`That school is already linked to “${other.name}”.`);
      applyRemote((d) => { d.years.find((y) => y.id === yearId).school = { id, role: 'member' }; });
      await sync();
    },
    /** Leave (members and admins): the schedule stays as this teacher's own. */
    leaveSchool: async (yearId) => {
      const year = latest.current.years.find((y) => y.id === yearId);
      if (!year.school.revoked) await api.removeSchoolMember(year.school.id, user.id);
      applyRemote((d) => unlinkSchool(d.years.find((y) => y.id === yearId)));
    },
    /** Delete the school online (owner); colleagues keep their copies. */
    deleteSchool: async (yearId) => {
      const year = latest.current.years.find((y) => y.id === yearId);
      await api.deleteSchool(year.school.id);
      applyRemote((d) => unlinkSchool(d.years.find((y) => y.id === yearId)));
    },
    newJoinCode: async (yearId) => {
      const year = latest.current.years.find((y) => y.id === yearId);
      await api.setJoinCode(year.school.id, makeJoinCode);
      await sync();
    },
    setSchoolRole: async (yearId, userId, role) => {
      const year = latest.current.years.find((y) => y.id === yearId);
      await api.setSchoolRole(year.school.id, userId, role);
      await sync();
    },
    removeSchoolMember: async (yearId, userId) => {
      const year = latest.current.years.find((y) => y.id === yearId);
      await api.removeSchoolMember(year.school.id, userId);
      await sync();
    },
  }), [user, sync, applyRemote, notify, latest]);

  const value = useMemo(() => ({
    configured: cloudConfigured,
    user,
    email: user?.email || '',
    status: user ? status : cloudConfigured ? (status === 'starting' ? 'starting' : 'signed-out') : 'off',
    error,
    lastSync: state?.cloud?.lastSync || null,
    pending,
    ...actions,
  }), [user, status, error, state?.cloud?.lastSync, pending, actions]);

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export const useCloud = () => useContext(CloudContext);
