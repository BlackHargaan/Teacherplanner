// Online account + background sync of team lesson banks.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { cloudConfigured } from './config.js';
import * as api from './backend.js';
import { applySnapshot, changesToPush, detachBank, fingerprint, markPushed } from './sync.js';
import { deleteBankLocally } from '../actions.js';

const CloudContext = createContext({ configured: false });
const SYNC_EVERY_MS = 2 * 60 * 1000;
const PUSH_DELAY_MS = 1500;
const CHECK_DELAY_MS = 400;

const hasChanges = (ch) => ch.banks.length + ch.lessons.length + ch.deletes.length > 0;

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

  // ---- one sync round: push local edits, then pull everything
  const sync = useCallback(async () => {
    if (!user || !latest.current) return;
    if (running.current) { again.current = true; return; }
    running.current = true;
    setStatus('syncing');
    try {
      do {
        again.current = false;
        const ch = changesToPush(latest.current);
        if (hasChanges(ch)) {
          await api.pushChanges(ch);
          applyRemote((d) => markPushed(d, ch));
        }
        const snap = await api.fetchSnapshot(user.id);
        // Teammates' changes also go into undo history (see applyRemote);
        // skip that work when nothing online changed since the last pull.
        const snapPrint = fingerprint(snap);
        applyRemote((d) => applySnapshot(d, snap, d.currentUserId), { history: snapPrint !== lastSnap.current });
        lastSnap.current = snapPrint;
      } while (again.current);
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
    let stop = false;
    api.acceptInvites().catch(() => {}).finally(() => !stop && sync());
    const timer = setInterval(sync, SYNC_EVERY_MS);
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    let debounce;
    const unsubscribe = api.subscribe(() => { clearTimeout(debounce); debounce = setTimeout(sync, 800); });
    return () => {
      stop = true;
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
    const t = setTimeout(() => setPending(hasChanges(changesToPush(latest.current))), CHECK_DELAY_MS);
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
    setDisplayName: (name) => api.setDisplayName(user.id, name),
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
  }), [user, sync, applyRemote, notify]);

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
