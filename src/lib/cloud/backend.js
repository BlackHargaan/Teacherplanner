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

/** Email a one-time sign-in code (creates the account on first use). */
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

// The server returns at most 1000 rows per request; anything past that would
// look "deleted online". Read every table in pages, in a fixed order.
const PAGE = 1000;
export async function fetchAll(makeQuery, pageSize = PAGE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = check(await makeQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** Everything this teacher can see (row-level security does the filtering). */
export async function fetchSnapshot(userId) {
  const db = await supabase();
  const [banks, lessons, members, profiles, invites, schools, schoolMembers] = await Promise.all([
    fetchAll(() => db.from('banks').select('*').order('id')),
    fetchAll(() => db.from('bank_lessons').select('id, bank_id, data, updated_at').order('bank_id').order('id')),
    fetchAll(() => db.from('bank_members').select('bank_id, user_id, role').order('bank_id').order('user_id')),
    fetchAll(() => db.from('profiles').select('id, email, display_name').order('id')),
    fetchAll(() => db.from('bank_invites').select('bank_id, email, role').order('bank_id').order('email')),
    fetchAll(() => db.from('schools').select('id, owner_id, name, join_code, data, updated_at').order('id')),
    fetchAll(() => db.from('school_members').select('school_id, user_id, role').order('school_id').order('user_id')),
  ]);
  return { userId, banks, lessons, members, profiles, invites, schools, schoolMembers };
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

// ---- school profiles

const isDuplicate = (err) => err?.code === '23505' || /duplicate key/i.test(String(err?.message));

/** Create a school; makeCode() is asked again if a join code is already taken. */
export async function createSchool({ id, name, data }, makeCode) {
  const db = await supabase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = makeCode();
    const { data: row, error } = await db.from('schools').insert({ id, name, join_code: joinCode, data }).select('id, owner_id, name, join_code, updated_at').single();
    if (!error) return row;
    if (!isDuplicate(error) || /schools_pkey/.test(String(error.message))) throw error;
  }
  throw new Error('Couldn’t make a join code. Please try again.');
}

export async function joinSchool(code) {
  return check(await (await supabase()).rpc('join_school', { p_code: code }));
}

/** Upload changed school schedules from schoolsToPush(). */
export async function pushSchools(list) {
  const db = await supabase();
  for (const s of list) check(await db.from('schools').update({ name: s.name, data: s.data }).eq('id', s.id));
}

export async function setJoinCode(schoolId, makeCode) {
  const db = await supabase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = makeCode();
    const { error } = await db.from('schools').update({ join_code: joinCode }).eq('id', schoolId);
    if (!error) return joinCode;
    if (!isDuplicate(error)) throw error;
  }
  throw new Error('Couldn’t make a new join code. Please try again.');
}

export async function deleteSchool(schoolId) {
  check(await (await supabase()).from('schools').delete().eq('id', schoolId));
}

export async function setSchoolRole(schoolId, userId, role) {
  check(await (await supabase()).from('school_members').update({ role }).eq('school_id', schoolId).eq('user_id', userId));
}

export async function removeSchoolMember(schoolId, userId) {
  check(await (await supabase()).from('school_members').delete().eq('school_id', schoolId).eq('user_id', userId));
}

/** Live notifications when a teammate changes something. */
export function subscribe(onChange) {
  let channel = null; let stopped = false;
  supabase().then((db) => {
    if (stopped) return;
    channel = db.channel('teacher-planner-banks');
    for (const table of ['banks', 'bank_lessons', 'bank_members', 'schools', 'school_members']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    }
    channel.subscribe();
  });
  return () => { stopped = true; if (channel) supabase().then((db) => db.removeChannel(channel)); };
}

/** Network trouble (as opposed to a real error worth showing). */
export const isOffline = (err) => !navigator.onLine || /fetch|network|Failed to fetch|NetworkError|ECONN|timeout/i.test(String(err?.message || err));
