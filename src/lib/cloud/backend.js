// Network calls to Supabase. Everything else talks to this module, so the
// sync logic can be tested without a server.
import { SUPABASE_ANON_KEY, SUPABASE_URL, cloudConfigured } from './config.js';

// The Supabase library is loaded on first use, so the app starts just as fast
// for teachers who never sign in.
let clientPromise = null;
export function supabase() {
  if (!cloudConfigured) return Promise.reject(new Error('Online sharing is not set up'));
  clientPromise ||= import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'teacher-planner-auth' },
  }));
  return clientPromise;
}

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---- account

/** Email a 6-digit sign-in code (creates the account on first use). */
export async function sendCode(email) {
  check(await (await supabase()).auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } }));
}

export async function verifyCode(email, code) {
  return check(await (await supabase()).auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\s+/g, ''), type: 'email' })).session;
}

export async function signOut() {
  check(await (await supabase()).auth.signOut());
}

export async function getSession() {
  return check(await (await supabase()).auth.getSession()).session;
}

export function onAuthChange(cb) {
  let sub = null; let stopped = false;
  supabase().then((db) => {
    if (stopped) return;
    sub = db.auth.onAuthStateChange((_event, session) => cb(session)).data.subscription;
  });
  return () => { stopped = true; sub?.unsubscribe(); };
}

export async function setDisplayName(userId, name) {
  check(await (await supabase()).from('profiles').update({ display_name: name, updated_at: new Date().toISOString() }).eq('id', userId));
}

// ---- banks

export async function acceptInvites() {
  return check(await (await supabase()).rpc('accept_invites'));
}

/** Everything this teacher can see (row-level security does the filtering). */
export async function fetchSnapshot(userId) {
  const db = await supabase();
  const [banks, lessons, members, profiles, invites] = await Promise.all([
    db.from('banks').select('*'),
    db.from('bank_lessons').select('id, bank_id, data, updated_at'),
    db.from('bank_members').select('bank_id, user_id, role'),
    db.from('profiles').select('id, email, display_name'),
    db.from('bank_invites').select('bank_id, email, role'),
  ]);
  return { userId, banks: check(banks), lessons: check(lessons), members: check(members), profiles: check(profiles), invites: check(invites) };
}

/** Upload { banks, lessons, deletes } from changesToPush(). */
export async function pushChanges(ch) {
  const db = await supabase();
  if (ch.banks.length) check(await db.from('banks').upsert(ch.banks, { onConflict: 'id' }));
  if (ch.lessons.length) {
    for (let i = 0; i < ch.lessons.length; i += 200) {
      check(await db.from('bank_lessons').upsert(ch.lessons.slice(i, i + 200), { onConflict: 'bank_id,id' }));
    }
  }
  const byBank = {};
  for (const d of ch.deletes) (byBank[d.bank_id] ||= []).push(d.id);
  for (const [bankId, ids] of Object.entries(byBank)) {
    check(await db.from('bank_lessons').delete().eq('bank_id', bankId).in('id', ids));
  }
}

export async function deleteBank(bankId) {
  check(await (await supabase()).from('banks').delete().eq('id', bankId));
}

export async function invite(bankId, email, role) {
  return check(await (await supabase()).rpc('invite_to_bank', { p_bank: bankId, p_email: email, p_role: role }));
}

export async function setMemberRole(bankId, userId, role) {
  check(await (await supabase()).from('bank_members').update({ role }).eq('bank_id', bankId).eq('user_id', userId));
}

export async function removeMember(bankId, userId) {
  check(await (await supabase()).from('bank_members').delete().eq('bank_id', bankId).eq('user_id', userId));
}

export async function cancelInvite(bankId, email) {
  check(await (await supabase()).from('bank_invites').delete().eq('bank_id', bankId).eq('email', email));
}

/** Live notifications when a teammate changes something. */
export function subscribe(onChange) {
  let channel = null; let stopped = false;
  supabase().then((db) => {
    if (stopped) return;
    channel = db.channel('teacher-planner-banks');
    for (const table of ['banks', 'bank_lessons', 'bank_members']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    }
    channel.subscribe();
  });
  return () => { stopped = true; if (channel) supabase().then((db) => db.removeChannel(channel)); };
}

/** Network trouble (as opposed to a real error worth showing). */
export const isOffline = (err) => !navigator.onLine || /fetch|network|Failed to fetch|NetworkError|ECONN|timeout/i.test(String(err?.message || err));
