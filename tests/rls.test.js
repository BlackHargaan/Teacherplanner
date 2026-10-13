// Runs the real migration in an embedded Postgres (PGlite) with a stand-in
// for Supabase's auth schema, then checks what each teacher can and can't do.
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Every migration, in order — the same files applied to the live project.
const DIR = new URL('../supabase/migrations/', import.meta.url);
const MIGRATIONS = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, DIR), 'utf8'));
const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  create publication supabase_realtime;
`;
const GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on public.banks, public.bank_members, public.bank_lessons, public.bank_invites to anon, authenticated;
  grant select, insert, update, delete on public.schools, public.school_members to anon, authenticated;
  grant select on public.profiles to anon, authenticated;
`;

const ANA = '00000000-0000-0000-0000-00000000000a';
const BEN = '00000000-0000-0000-0000-00000000000b';
const CLEO = '00000000-0000-0000-0000-00000000000c';
const DAN = '00000000-0000-0000-0000-00000000000d';
const EMAIL = { [ANA]: 'ana@school.org', [BEN]: 'ben@school.org', [CLEO]: 'cleo@school.org', [DAN]: 'dan@school.org' };

let db;
async function signUp(id) {
  await db.query('reset role');
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, EMAIL[id], { display_name: EMAIL[id].split('@')[0] }]);
}
/** Run SQL as a signed-in teacher (or anonymously when id is null). */
async function as(id, sql, params = []) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [id || '', id ? JSON.stringify({ sub: id, email: EMAIL[id], role: 'authenticated' }) : '']);
  await db.query(id ? 'set role authenticated' : 'set role anon');
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.query('reset role');
  }
}
const fails = async (p) => { try { await p; return false; } catch { return true; } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const sql of MIGRATIONS) await db.exec(sql);
  await db.exec(GRANTS);
  for (const id of [ANA, BEN, DAN]) await signUp(id);
  await as(ANA, "insert into banks (id, name) values ('bank-1', 'Grade 7 Science')");
  await as(ANA, `insert into bank_lessons (id, bank_id, data) values ('l1', 'bank-1', '{"title":"Cells"}')`);
}, 60000);

describe('team lesson banks — row-level security', () => {
  it('creates a profile for each new account', async () => {
    expect(await as(ANA, 'select email, display_name from profiles')).toEqual([{ email: 'ana@school.org', display_name: 'ana' }]);
  });

  it('keeps a bank private until its owner shares it', async () => {
    expect(await as(BEN, 'select * from banks')).toEqual([]);
    expect(await as(BEN, 'select * from bank_lessons')).toEqual([]);
    expect(await as(null, 'select * from banks')).toEqual([]);
    expect(await fails(as(BEN, "update banks set name = 'hacked' where id = 'bank-1'")) || (await as(ANA, 'select name from banks'))[0].name === 'Grade 7 Science').toBe(true);
    expect((await as(ANA, 'select name from banks'))[0].name).toBe('Grade 7 Science');
  });

  it('does not let anyone create a bank in someone else’s name', async () => {
    expect(await fails(as(BEN, `insert into banks (id, owner_id) values ('bank-x', '${ANA}')`))).toBe(true);
  });

  it('lets only the owner invite, and viewers only read', async () => {
    expect(await fails(as(BEN, "select invite_to_bank('bank-1', 'ben@school.org', 'edit')"))).toBe(true);
    expect(await fails(as(null, "select invite_to_bank('bank-1', 'dan@school.org', 'view')"))).toBe(true);
    expect((await as(ANA, "select invite_to_bank('bank-1', 'Ben@School.org ', 'view') as r"))[0].r).toBe('added');
    expect((await as(BEN, 'select name from banks')).map((r) => r.name)).toEqual(['Grade 7 Science']);
    expect((await as(BEN, 'select id from bank_lessons')).map((r) => r.id)).toEqual(['l1']);
    // viewers can't change anything
    await as(BEN, `update bank_lessons set data = '{"title":"changed"}' where id = 'l1'`).catch(() => {});
    expect((await as(ANA, "select data->>'title' as t from bank_lessons"))[0].t).toBe('Cells');
    expect(await fails(as(BEN, `insert into bank_lessons (id, bank_id, data) values ('l2', 'bank-1', '{}')`))).toBe(true);
    await as(BEN, "delete from bank_lessons where id = 'l1'");
    expect((await as(ANA, 'select count(*)::int as n from bank_lessons'))[0].n).toBe(1);
  });

  it('lets editors change lessons but not membership, ownership or the bank’s existence', async () => {
    await as(ANA, "select invite_to_bank('bank-1', 'ben@school.org', 'edit')");
    await as(BEN, `update bank_lessons set data = '{"title":"Cells (edited)"}' where id = 'l1'`);
    expect((await as(ANA, "select data->>'title' as t, updated_by from bank_lessons"))[0]).toEqual({ t: 'Cells (edited)', updated_by: BEN });
    await as(BEN, `insert into bank_lessons (id, bank_id, data) values ('l2', 'bank-1', '{"title":"Mitosis"}')`);
    await as(BEN, "update banks set name = 'Grade 7 Science Team' where id = 'bank-1'");
    expect((await as(ANA, 'select name from banks'))[0].name).toBe('Grade 7 Science Team');
    expect(await fails(as(BEN, `update banks set owner_id = '${BEN}' where id = 'bank-1'`))).toBe(true);
    expect(await fails(as(BEN, `insert into bank_members (bank_id, user_id, role) values ('bank-1', '${DAN}', 'edit')`))).toBe(true);
    await as(BEN, "delete from banks where id = 'bank-1'");
    expect((await as(ANA, 'select count(*)::int as n from banks'))[0].n).toBe(1);
  });

  it('shows teammates’ names to each other but not to strangers', async () => {
    expect((await as(BEN, 'select email from profiles order by email')).map((r) => r.email)).toEqual(['ana@school.org', 'ben@school.org']);
    expect((await as(DAN, 'select email from profiles')).map((r) => r.email)).toEqual(['dan@school.org']);
    expect(await as(DAN, 'select * from banks')).toEqual([]);
    expect(await as(DAN, 'select * from bank_members')).toEqual([]);
    expect(await as(DAN, 'select * from bank_lessons')).toEqual([]);
  });

  it('only lets teachers change their display name, not their email', async () => {
    await as(BEN, "update profiles set display_name = 'Mr. B' where id = auth.uid()");
    expect((await as(BEN, 'select display_name from profiles where id = auth.uid()'))[0].display_name).toBe('Mr. B');
    expect(await fails(as(BEN, "update profiles set email = 'ana@school.org' where id = auth.uid()"))).toBe(true);
    await as(BEN, `update profiles set display_name = 'hijack' where id = '${ANA}'`);
    expect((await as(ANA, 'select display_name from profiles where id = auth.uid()'))[0].display_name).toBe('ana');
  });

  it('holds an invitation until the invited teacher signs up', async () => {
    expect((await as(ANA, "select invite_to_bank('bank-1', 'cleo@school.org', 'view') as r"))[0].r).toBe('invited');
    expect((await as(DAN, 'select * from bank_invites'))).toEqual([]);
    await signUp(CLEO);
    expect((await as(CLEO, 'select email from bank_invites')).map((r) => r.email)).toEqual(['cleo@school.org']);
    expect((await as(CLEO, 'select accept_invites() as n'))[0].n).toBe(1);
    expect((await as(CLEO, 'select name from banks')).map((r) => r.name)).toEqual(['Grade 7 Science Team']);
    expect(await as(CLEO, 'select * from bank_invites')).toEqual([]);
    expect((await as(CLEO, 'select accept_invites() as n'))[0].n).toBe(0);
  });

  it('does not expose the access-check helpers or trigger functions as API calls', async () => {
    const callable = await as(BEN, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege(p.oid, 'execute') order by 1`);
    expect(callable.map((r) => r.proname)).toEqual(['accept_invites', 'invite_to_bank', 'join_school']);
    expect((await as(null, `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and has_function_privilege(p.oid, 'execute')`))[0].n).toBe(0);
  });

  it('lets a member leave, and the owner remove members', async () => {
    await as(CLEO, 'delete from bank_members where user_id = auth.uid()');
    expect(await as(CLEO, 'select * from banks')).toEqual([]);
    await as(BEN, `delete from bank_members where user_id = '${ANA}'`); // no-op: owner isn't a member row
    await as(ANA, `delete from bank_members where user_id = '${BEN}'`);
    expect(await as(BEN, 'select * from banks')).toEqual([]);
  });
});

describe('school profiles — row-level security', () => {
  const CODE = 'ABCD2345';
  const schoolOf = (id) => as(id, 'select id, name, join_code, data from schools');

  it('keeps a school private until someone joins with its code', async () => {
    await as(DAN, `insert into schools (id, name, join_code, data) values ('school-1', 'Greene Intermediate', '${CODE}', '{"start":"2026-08-24"}')`);
    expect((await schoolOf(DAN)).map((r) => r.name)).toEqual(['Greene Intermediate']);
    expect(await schoolOf(BEN)).toEqual([]);
    expect(await as(null, 'select * from schools')).toEqual([]);
    expect(await fails(as(BEN, `insert into schools (id, owner_id, join_code) values ('school-x', '${DAN}', 'ZZZZ2345')`))).toBe(true);
  });

  it('rejects malformed or duplicate join codes', async () => {
    expect(await fails(as(BEN, "insert into schools (id, join_code) values ('school-y', 'abc')"))).toBe(true);
    expect(await fails(as(BEN, `insert into schools (id, join_code) values ('school-z', '${CODE}')`))).toBe(true);
  });

  it('joins with the code (any case or spacing) and not with a wrong one', async () => {
    expect(await fails(as(BEN, "select join_school('WRONG234')"))).toBe(true);
    expect(await fails(as(null, `select join_school('${CODE}')`))).toBe(true);
    expect((await as(BEN, "select join_school(' abcd-2345 ') as id"))[0].id).toBe('school-1');
    expect((await schoolOf(BEN)).map((r) => r.join_code)).toEqual([CODE]);
    expect((await as(BEN, 'select role from school_members where user_id = auth.uid()'))[0].role).toBe('member');
    expect((await as(DAN, "select join_school('ABCD2345') as id"))[0].id).toBe('school-1'); // owner: no member row
    expect((await as(DAN, 'select count(*)::int as n from school_members'))[0].n).toBe(1);
  });

  it('lets members read but not change the schedule or let others in', async () => {
    await as(BEN, `update schools set data = '{"start":"2030-01-01"}' where id = 'school-1'`);
    expect((await schoolOf(DAN))[0].data.start).toBe('2026-08-24');
    expect(await fails(as(BEN, `insert into school_members (school_id, user_id) values ('school-1', '${CLEO}')`))).toBe(true);
    await as(BEN, "update school_members set role = 'admin' where user_id = auth.uid()");
    expect((await as(BEN, 'select role from school_members where user_id = auth.uid()'))[0].role).toBe('member');
    await as(BEN, "delete from schools where id = 'school-1'");
    expect((await schoolOf(DAN)).length).toBe(1);
  });

  it('lets the owner make admins, and admins edit the schedule and code', async () => {
    await as(DAN, `update school_members set role = 'admin' where user_id = '${BEN}'`);
    await as(BEN, `update schools set data = '{"start":"2026-08-25"}', join_code = 'WXYZ6789' where id = 'school-1'`);
    const row = (await as(DAN, 'select data, join_code, updated_by from schools'))[0];
    expect(row).toEqual({ data: { start: '2026-08-25' }, join_code: 'WXYZ6789', updated_by: BEN });
    expect(await fails(as(BEN, `update schools set owner_id = '${BEN}' where id = 'school-1'`))).toBe(true);
    await as(BEN, `update school_members set role = 'member' where user_id = '${BEN}'`); // only the owner changes roles
    expect((await as(DAN, `select role from school_members where user_id = '${BEN}'`))[0].role).toBe('admin');
  });

  it('shows school colleagues’ names to each other', async () => {
    expect((await as(DAN, 'select email from profiles order by email')).map((r) => r.email)).toContain('ben@school.org');
  });

  it('lets members leave and the owner delete the school', async () => {
    await as(CLEO, "select join_school('WXYZ6789')");
    await as(CLEO, 'delete from school_members where user_id = auth.uid()');
    expect(await schoolOf(CLEO)).toEqual([]);
    await as(DAN, "delete from schools where id = 'school-1'");
    expect(await schoolOf(BEN)).toEqual([]);
    expect((await as(DAN, 'select count(*)::int as n from school_members'))[0].n).toBe(0);
  });
});
