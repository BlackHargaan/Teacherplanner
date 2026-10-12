import { describe, it, expect } from 'vitest';
import { applySnapshot, changesToPush, markPushed, toCloudLesson, detachBank } from '../src/lib/cloud/sync.js';
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
