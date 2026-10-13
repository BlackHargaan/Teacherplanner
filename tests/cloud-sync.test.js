import { describe, it, expect } from 'vitest';
import { applySnapshot, changesByBank, changesToPush, markPushed, toCloudLesson, detachBank } from '../src/lib/cloud/sync.js';
import { demoState, makeBank, makeLesson } from '../src/lib/model.js';

/** A tiny stand-in for the database (permissions are tested separately in rls.test.js). */
function fakeServer() {
  const banks = new Map(); const lessons = new Map(); const members = [];
  return {
    banks, lessons, members,
    push(userId, ch) {
      for (const b of ch.banks) banks.set(b.id, { ...b, owner_id: banks.get(b.id)?.owner_id || userId, updated_at: 't' });
      for (const l of ch.lessons) lessons.set(`${l.bank_id}/${l.id}`, structuredClone(l));
      for (const x of ch.deletes) lessons.delete(`${x.bank_id}/${x.id}`);
    },
    snapshot(userId) {
      const visible = [...banks.values()].filter((b) => b.owner_id === userId || members.some((m) => m.bank_id === b.id && m.user_id === userId));
      const ids = new Set(visible.map((b) => b.id));
      return {
        userId,
        banks: structuredClone(visible),
        lessons: structuredClone([...lessons.values()].filter((l) => ids.has(l.bank_id))),
        members: members.filter((m) => ids.has(m.bank_id)),
        profiles: [{ id: 'ana', email: 'ana@s.org', display_name: 'Ana' }, { id: 'ben', email: 'ben@s.org', display_name: 'Ben' }],
        invites: [],
      };
    },
  };
}

function sync(server, planner, cloudUser) {
  const ch = changesToPush(planner);
  server.push(cloudUser, ch);
  markPushed(planner, ch);
  applySnapshot(planner, server.snapshot(cloudUser), planner.currentUserId);
  return ch;
}

function setup() {
  const server = fakeServer();
  const ana = demoState(); const ben = demoState();
  ana.cloud = { shadow: {} }; ben.cloud = { shadow: {} };
  const bank = makeBank({ id: 'bank-team', ownerId: ana.currentUserId, name: 'Team Science' });
  const l1 = makeLesson({ id: 'les-1', homeType: 'bank', homeId: bank.id, title: 'Cells', privateNotes: { [ana.currentUserId]: 'ANA SECRET' },
    attachments: [{ id: 'a1', type: 'link', name: 'Video', url: 'https://example.org/v' }, { id: 'a2', type: 'file', name: 'worksheet.pdf', path: 'attachments/worksheet.pdf' }] });
  const l2 = makeLesson({ id: 'les-2', homeType: 'bank', homeId: bank.id, title: 'Mitosis' });
  bank.sequence = [l1.id, l2.id];
  ana.banks.push(bank); ana.lessons[l1.id] = l1; ana.lessons[l2.id] = l2;
  // Ana publishes: the bank becomes an online bank she owns
  bank.cloud = { role: 'owner', members: [], invites: [] };
  sync(server, ana, 'ana');
  server.members.push({ bank_id: 'bank-team', user_id: 'ben', role: 'edit' });
  sync(server, ben, 'ben');
  return { server, ana, ben };
}

describe('online team banks — sync', () => {
  it('publishing uploads the bank and its lessons without private notes or local files', () => {
    const { server } = setup();
    expect(server.banks.get('bank-team').name).toBe('Team Science');
    const data = server.lessons.get('bank-team/les-1').data;
    expect(JSON.stringify(data)).not.toContain('ANA SECRET');
    expect(data.attachments).toEqual([
      { id: 'a1', type: 'link', name: 'Video', url: 'https://example.org/v' },
      { id: 'a2', type: 'file', name: 'worksheet.pdf', localOnly: true },
    ]);
  });

  it('a teammate receives the bank with the right role', () => {
    const { ben } = setup();
    const bank = ben.banks.find((b) => b.id === 'bank-team');
    expect(bank.cloud.role).toBe('edit');
    expect(bank.sharing[ben.currentUserId]).toBe('edit');
    expect(bank.cloud.ownerName).toBe('Ana');
    expect(ben.lessons['les-1'].title).toBe('Cells');
    expect(ben.lessons['les-1'].privateNotes).toEqual({});
  });

  it('nothing is re-sent when nothing changed', () => {
    const { server, ana, ben } = setup();
    expect(changesToPush(ana)).toEqual({ banks: [], lessons: [], deletes: [] });
    expect(changesToPush(ben)).toEqual({ banks: [], lessons: [], deletes: [] });
    sync(server, ana, 'ana');
    expect(changesToPush(ana)).toEqual({ banks: [], lessons: [], deletes: [] });
  });

  it('an editor’s change reaches the owner, who keeps their private notes and local file', () => {
    const { server, ana, ben } = setup();
    ben.lessons['les-1'].title = 'Cells (team edit)';
    ben.lessons['les-1'].privateNotes = { [ben.currentUserId]: 'BEN SECRET' };
    const pushed = sync(server, ben, 'ben');
    expect(pushed.lessons.map((l) => l.id)).toEqual(['les-1']);
    expect(JSON.stringify(server.lessons.get('bank-team/les-1'))).not.toContain('BEN SECRET');
    sync(server, ana, 'ana');
    expect(ana.lessons['les-1'].title).toBe('Cells (team edit)');
    expect(ana.lessons['les-1'].privateNotes[ana.currentUserId]).toBe('ANA SECRET');
    expect(ana.lessons['les-1'].attachments.find((a) => a.id === 'a2').path).toBe('attachments/worksheet.pdf');
  });

  it('an unsent local edit is never overwritten by a pull', () => {
    const { server, ana, ben } = setup();
    ben.lessons['les-2'].title = 'Mitosis (Ben)';
    sync(server, ben, 'ben');
    ana.lessons['les-2'].title = 'Mitosis (Ana, offline)';
    applySnapshot(ana, server.snapshot('ana'), ana.currentUserId); // pull without pushing first
    expect(ana.lessons['les-2'].title).toBe('Mitosis (Ana, offline)');
    expect(changesToPush(ana).lessons.map((l) => l.id)).toEqual(['les-2']);
  });

  it('new lessons and deletions travel both ways; linked lessons survive deletion', () => {
    const { server, ana, ben } = setup();
    ben.lessons['les-3'] = makeLesson({ id: 'les-3', homeType: 'bank', homeId: 'bank-team', title: 'Meiosis' });
    ben.banks.find((b) => b.id === 'bank-team').sequence.push('les-3');
    sync(server, ben, 'ben');
    sync(server, ana, 'ana');
    expect(ana.lessons['les-3'].title).toBe('Meiosis');
    expect(ana.banks.find((b) => b.id === 'bank-team').sequence).toEqual(['les-1', 'les-2', 'les-3']);
    // Ana linked les-2 into her class; Ben deletes les-2 and les-3
    ana.classes[0].sequence.push('les-2');
    for (const id of ['les-2', 'les-3']) delete ben.lessons[id];
    ben.banks.find((b) => b.id === 'bank-team').sequence = ['les-1'];
    expect(changesToPush(ben).deletes.map((x) => x.id).sort()).toEqual(['les-2', 'les-3']);
    sync(server, ben, 'ben');
    sync(server, ana, 'ana');
    expect(ana.lessons['les-3']).toBeUndefined();
    expect(ana.lessons['les-2'].title).toBe('Mitosis'); // still in her class
    expect(ana.banks.find((b) => b.id === 'bank-team').sequence).toEqual(['les-1']);
  });

  it('viewers never upload, even if their copy changes', () => {
    const { server, ben } = setup();
    server.members[0].role = 'view';
    sync(server, ben, 'ben');
    ben.lessons['les-1'].title = 'should not upload';
    expect(changesToPush(ben)).toEqual({ banks: [], lessons: [], deletes: [] });
  });

  it('losing access keeps a read-only local copy', () => {
    const { server, ben } = setup();
    server.members.length = 0;
    sync(server, ben, 'ben');
    const bank = ben.banks.find((b) => b.id === 'bank-team');
    expect(bank.cloud.revoked).toBe(true);
    expect(bank.sharing[ben.currentUserId]).toBe('view');
    expect(ben.lessons['les-1'].title).toBe('Cells');
    detachBank(ben, 'bank-team', ben.currentUserId);
    expect(bank.cloud).toBeUndefined();
    expect(bank.ownerId).toBe(ben.currentUserId);
  });

  it('toCloudLesson strips private data only', () => {
    const l = makeLesson({ title: 'X', privateNotes: { me: 'secret' }, ownerId: 'u1' });
    const c = toCloudLesson(l);
    expect(c.privateNotes).toBeUndefined();
    expect(c.ownerId).toBeUndefined();
    expect(c.title).toBe('X');
  });
});

describe('online team banks — review fixes', () => {
  it('a lesson a teammate deletes online is not uploaded again by someone who linked it', () => {
    const { server, ana, ben } = setup();
    const cls = ben.classes[0];
    cls.sequence.push('les-2'); // Ben uses Mitosis in his class
    // Ana deletes Mitosis from the bank
    ana.banks[0].sequence = ['les-1'];
    delete ana.lessons['les-2'];
    sync(server, ana, 'ana');
    expect(server.lessons.has('bank-team/les-2')).toBe(false);
    sync(server, ben, 'ben');
    expect(ben.lessons['les-2']).toMatchObject({ homeType: 'class', homeId: cls.id, title: 'Mitosis' }); // Ben keeps his copy
    const again = sync(server, ben, 'ben');
    expect(again.lessons.map((l) => l.id)).not.toContain('les-2');
    expect(server.lessons.has('bank-team/les-2')).toBe(false);
  });

  it('a bank shared a moment ago is not marked "no longer shared" by an older snapshot', () => {
    const { server, ana } = setup();
    const before = server.snapshot('ana'); // fetched before the new bank was online
    const fresh = makeBank({ id: 'bank-new', ownerId: ana.currentUserId, name: 'New' });
    fresh.cloud = { role: 'owner', members: [], invites: [] };
    ana.banks.push(fresh);
    applySnapshot(ana, before, ana.currentUserId);
    expect(ana.banks.find((b) => b.id === 'bank-new').cloud).toMatchObject({ role: 'owner' });
    expect(ana.banks.find((b) => b.id === 'bank-new').cloud.revoked).toBeUndefined();
    sync(server, ana, 'ana');
    expect(server.banks.has('bank-new')).toBe(true);
  });

  it('an online lesson cannot take over a lesson that lives in another bank or class', () => {
    const { server, ben } = setup();
    const mine = ben.classes[0].sequence.find(Boolean);
    const original = structuredClone(ben.lessons[mine]);
    // Someone with edit rights on the team bank uploads a row reusing that id
    server.lessons.set(`bank-team/${mine}`, { id: mine, bank_id: 'bank-team', data: { title: 'Hijacked', content: {} } });
    sync(server, ben, 'ben');
    expect(ben.lessons[mine]).toMatchObject({ homeType: original.homeType, homeId: original.homeId, title: original.title });
  });
});

describe('reading online data', () => {
  it('reads past the server’s 1000-row limit in pages', async () => {
    const { fetchAll } = await import('../src/lib/cloud/backend.js');
    const rows = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
    const ranges = [];
    const makeQuery = () => ({ range: async (from, to) => { ranges.push([from, to]); return { data: rows.slice(from, to + 1), error: null }; } });
    const all = await fetchAll(makeQuery);
    expect(all).toHaveLength(2345);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    const exact = await fetchAll(() => ({ range: async (from, to) => ({ data: rows.slice(0, 2000).slice(from, to + 1), error: null }) }));
    expect(exact).toHaveLength(2000);
    await expect(fetchAll(() => ({ range: async () => ({ data: null, error: new Error('nope') }) }))).rejects.toThrow('nope');
  });
});

describe('online team banks — sync order and access changes', () => {
  it('groups uploads per bank and knows which banks are new', () => {
    const { ana } = setup();
    const fresh = makeBank({ id: 'bank-new', ownerId: ana.currentUserId, name: 'New' });
    fresh.cloud = { role: 'owner', members: [], invites: [] };
    ana.banks.push(fresh);
    ana.lessons['les-1'].title = 'Cells!';
    const groups = changesByBank(ana, changesToPush(ana)).sort((a, b) => a.bankId.localeCompare(b.bankId));
    expect(groups.map((g) => [g.bankId, g.isNew, g.banks.length, g.lessons.length])).toEqual([['bank-new', true, 1, 0], ['bank-team', false, 0, 1]]);
  });

  it('a view-only copy edited locally (e.g. a tag removed) still gets the owner’s updates', () => {
    const { server, ana, ben } = setup();
    server.members[0].role = 'view';
    applySnapshot(ben, server.snapshot('ben'), ben.currentUserId);
    ben.lessons['les-1'].statusIds = ['something-else'];
    expect(changesToPush(ben).lessons).toEqual([]);
    ana.lessons['les-1'].title = 'Cells v2';
    sync(server, ana, 'ana');
    applySnapshot(ben, server.snapshot('ben'), ben.currentUserId);
    expect(ben.lessons['les-1'].title).toBe('Cells v2');
  });

  it('signing in as another account keeps the old banks read-only and never uploads them', () => {
    const { server, ana } = setup();
    ana.lessons['les-1'].title = 'unsent edit';
    applySnapshot(ana, server.snapshot('someone-else'), ana.currentUserId);
    const bank = ana.banks.find((b) => b.id === 'bank-team');
    expect(bank.cloud.revoked).toBe(true);
    expect(changesToPush(ana)).toEqual({ banks: [], lessons: [], deletes: [] });
    // back on the right account, the bank is followed again
    applySnapshot(ana, server.snapshot('ana'), ana.currentUserId);
    expect(bank.cloud.revoked).toBeUndefined();
    expect(bank.cloud.role).toBe('owner');
  });
});
