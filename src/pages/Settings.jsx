import { useEffect, useState } from 'react';
import { UpdatesCard } from '../components/Updates.jsx';
import { AccountCard } from '../components/CloudAccount.jsx';
import { useCloud } from '../lib/cloud/CloudProvider.jsx';
import { useHashRoute } from '../lib/router.js';
import { host, useStore, resetToDemo, resetToEmpty } from '../lib/store.jsx';
import { uid } from '../lib/model.js';
import { Field, Modal, download } from '../components/ui.jsx';
import { formatDate } from '../lib/dates.js';
import { today } from '../lib/dates.js';
import { MODES, PALETTES, paletteById } from '../data/themes.js';
import { useTour } from '../components/Tour.jsx';
import { resetPageTours, setTips } from '../lib/tours.js';
import { keepStorage, storageStatus } from '../lib/browserStorage.js';
import { exportBackup } from '../lib/backup.js';
import { mergeStudentData } from '../lib/cloud/plannerSync.js';

export default function Settings() {
  const { state, update, applyRemote, replace, notify, userId, vault, openVault } = useStore();
  const tour = useTour();
  const cloud = useCloud();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const me = state.users.find((u) => u.id === userId);
  const [, section] = useHashRoute();
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [section]);
  const setAppearance = (patch) => update((d) => {
    const u = d.users.find((x) => x.id === userId);
    u.appearance = { ...(u.appearance || {}), ...patch };
  });

  // Students, grades, seats and sub notes from a backup, into the classes this planner already has.
  const importStudents = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((t) => {
      let data;
      try {
        data = JSON.parse(t);
        if (!data.classes) throw new Error('bad');
      } catch {
        notify('That file is not a Teacher Planner backup.', true);
        return;
      }
      const matching = state.classes.filter((c) => data.classes.some((x) => x.id === c.id)).length;
      if (!matching) { notify('None of the classes in that backup are in this planner.', true); return; }
      if (!window.confirm(`Bring in students, grades, seating charts and sub notes for ${matching} ${matching === 1 ? 'class' : 'classes'} from this backup? Student information already here for those classes is replaced.`)) return;
      update((d) => { mergeStudentData(d, data); }, { separate: true });
      notify(`Student information brought in for ${matching} ${matching === 1 ? 'class' : 'classes'}.`, { undo: true });
    });
  };

  const importBackup = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((t) => {
      try {
        const data = JSON.parse(t);
        if (!data.years || !data.classes || !data.lessons) throw new Error('bad');
        if (!window.confirm('Replace all current data with this backup?')) return;
        // This computer's sync records stay: the restored planner then counts as edited here and is saved online.
        replace({ ...data, cloud: state.cloud });
        notify('Backup restored');
      } catch {
        notify('That file is not a Teacher Planner backup.', true);
      }
    });
  };

  return (
    <div className="page">
      <div className="page-head"><h1>Settings</h1></div>
      <div className="cards">
        <section data-tour="appearance" className="card wide">
          <h2>Appearance</h2>
          <div className="palette-grid">
            {PALETTES.map((p) => {
              const on = paletteById(me.appearance?.palette).id === p.id;
              return (
                <button key={p.id} className={`palette-option ${on ? 'on' : ''}`} onClick={() => setAppearance({ palette: p.id })} aria-pressed={on}>
                  <span className="palette-preview" aria-hidden="true">
                    <span style={{ background: p.light.bg }}><i style={{ background: p.light.surface2 }} /><i style={{ background: p.light.accent }} /></span>
                    <span style={{ background: p.dark.bg }}><i style={{ background: p.dark.surface2 }} /><i style={{ background: p.dark.accent }} /></span>
                  </span>
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="row wrap">
            <span className="small">Light or dark</span>
            <div className="segmented" role="group" aria-label="Light or dark">
              {MODES.map(([id, label]) => (
                <button key={id} className={(me.appearance?.mode || 'auto') === id ? 'on' : ''} onClick={() => setAppearance({ mode: id })}>{label}</button>
              ))}
            </div>
          </div>
          <p className="small muted">Each palette has a light and a dark version. Your choice is saved with your profile. Class and lesson-section colors are set on the Classes page.</p>
        </section>

        <section className="card" id="tours">
          <h2>Tours and tips</h2>
          <p className="small muted">Short guided tours point out what’s on each screen. They’re also in the ? menu at the top.</p>
          <div className="row wrap">
            <button className="primary" onClick={() => tour.start('start')}>Start the getting-started tour</button>
          </div>
          <label className="row small">
            <input type="checkbox" checked={me.tutorial?.tips !== false} onChange={(e) => applyRemote((d) => setTips(d.users.find((u) => u.id === userId), e.target.checked))} />
            Offer a quick tour the first time I open each page
          </label>
          <button className="link-btn small" onClick={() => { applyRemote((d) => resetPageTours(d.users.find((u) => u.id === userId))); notify('Each page will offer its tour again.'); }}>Offer every page’s tour again</button>
        </section>

        <section className="card">
          <h2>My profile</h2>
          <Field label="Name (shown on shared pages)"><input value={me.name} onChange={(e) => update((d) => { d.users.find((u) => u.id === userId).name = e.target.value; })} /></Field>
          <Field label="Email"><input type="email" value={me.email} placeholder="you@school.org" onChange={(e) => update((d) => { d.users.find((u) => u.id === userId).email = e.target.value; })} /></Field>
        </section>

        <section className="card">
          <h2>Team members</h2>
          <p className="small muted">Colleagues you can share classes and lesson banks with. Use “Switch to” to see the planner as that teacher (handy on a shared team computer).</p>
          <ul className="list">
            {state.users.map((u) => (
              <li key={u.id}>
                <span className="grow">{u.name} <span className="muted small">{u.email}</span></span>
                {u.id === userId ? <span className="badge">you</span> : (
                  <>
                    <button onClick={() => update((d) => { d.currentUserId = u.id; })}>Switch to</button>
                    <button className="icon-btn" onClick={() => {
                      if (!window.confirm(`Remove ${u.name}? Their classes and banks are kept but unshared.`)) return;
                      update((d) => {
                        d.users = d.users.filter((x) => x.id !== u.id);
                        for (const c of [...d.classes, ...d.banks]) { if (c.sharing) delete c.sharing[u.id]; if (c.ownerId === u.id) c.ownerId = userId; }
                      });
                    }}>✕</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button disabled={!name} onClick={() => { update((d) => { d.users.push({ id: uid('user'), name, email }); }); setName(''); setEmail(''); }}>Add</button>
          </div>
        </section>

        <AccountCard />
        <UpdatesCard />

        <section data-tour="statuses" className="card">
          <h2>Lesson status tags</h2>
          {state.statuses.map((s, i) => (
            <div key={s.id} className="row">
              <input type="color" value={s.color} onChange={(e) => update((d) => { d.statuses[i].color = e.target.value; })} />
              <input value={s.name} onChange={(e) => update((d) => { d.statuses[i].name = e.target.value; })} className="grow" />
              <button className="icon-btn" onClick={() => update((d) => {
                d.statuses.splice(i, 1);
                // Lessons in online banks belong to the team too: leave their tags alone.
                const online = new Set(d.banks.filter((b) => b.cloud).map((b) => b.id));
                for (const l of Object.values(d.lessons)) {
                  if (l.homeType === 'bank' && online.has(l.homeId)) continue;
                  l.statusIds = l.statusIds.filter((x) => x !== s.id);
                }
                for (const v of d.views) v.statusIds = v.statusIds.filter((x) => x !== s.id);
              })}>✕</button>
            </div>
          ))}
          <button onClick={() => update((d) => { d.statuses.push({ id: uid('st'), name: 'New status', color: '#0ea5e9' }); })}>+ Status</button>
        </section>

        <section data-tour="data" id="data" className="card">
          <h2>Data</h2>
          {host && vault?.vaultPath ? (
            <>
              <p className="small">Your planner folder:<br /><code>{vault.vaultPath}</code></p>
              <p className="small muted">Saved automatically as you work, with a daily backup in its <code>backups</code> folder. Keep this folder in OneDrive, Google Drive or Dropbox to use the planner on more than one computer (one computer at a time).</p>
              <div className="row wrap">
                <button onClick={() => host.openPath()}>Open folder</button>
                <button onClick={() => moveOrSwitchFolder(state, openVault, notify)}>Move / switch folder…</button>
                <button onClick={() => setRestoring(true)}>Restore an earlier version…</button>
              </div>
            </>
          ) : (
            <BrowserStorageNote lastBackup={state.lastBackup} savedOnline={cloud.savingOnline} />
          )}
          <div className="row wrap">
            <button className="primary" onClick={() => exportBackup(state, applyRemote)}>Export backup</button>
            <label className="btn">Import backup<input type="file" accept="application/json,.json" hidden onChange={importBackup} /></label>
            <label className="btn" title="Students, grades, seating charts and sub notes for the classes in this planner">Import student information<input type="file" accept="application/json,.json" hidden onChange={importStudents} /></label>
          </div>
          <div className="row wrap">
            <button onClick={() => { if (window.confirm(`Replace everything with sample data?${cloud.savingOnline ? ' Saving online stops on this computer; your plans saved online stay as they are.' : ''}`)) { replace(resetToDemo()); notify('Loaded the sample planner.', { undo: true }); } }}>Load sample data</button>
            <button className="danger" onClick={() => { if (window.confirm(`Erase everything and start fresh?${cloud.savingOnline ? ' Saving online stops on this computer; your plans saved online stay as they are.' : ''}`)) { replace(resetToEmpty()); notify('Started a fresh planner.', { undo: true }); } }}>Start fresh</button>
          </div>
        </section>
      </div>
      {restoring && <RestoreDialog onClose={() => setRestoring(false)} />}
    </div>
  );
}

/** Browser: where the planner is kept, and whether the browser has promised to keep it. */
function BrowserStorageNote({ lastBackup, savedOnline }) {
  const [status, setStatus] = useState(null);
  useEffect(() => { storageStatus().then(setStatus); }, []);
  const ask = async () => { await keepStorage(); setStatus(await storageStatus()); };
  return (
    <>
      <p className="small">Your planner is saved in this browser on this computer{status?.usedMB ? ` (${status.usedMB} MB)` : ''}.{savedOnline ? ' Your plans are also saved online in your account; student information is only here.' : ''}</p>
      {status && (status.kept ? (
        <p className="small muted">This browser has agreed to keep it, so it won’t be cleared to free up space. Clearing your browsing data or using another computer still starts you without it.</p>
      ) : (
        <p className="small muted">
          This browser may clear it to free up space, or after a few weeks without a visit (Safari does this). <button className="link-btn" onClick={ask}>Ask the browser to keep it</button>
        </p>
      ))}
      <p className="small muted">Last backup: <strong>{lastBackup ? formatDate(lastBackup) : 'never'}</strong>. {savedOnline ? 'Export a backup every week or two to keep student information safe.' : <>Export a backup every week or two, and to move to another computer. Or <a href="#/settings/account">save your plans online</a>.</>}</p>
    </>
  );
}

/**
 * Desktop: pick another folder. If it already has a planner, switch to it
 * only after the teacher agrees; otherwise move this planner (and its
 * attachments) there.
 */
async function moveOrSwitchFolder(state, openVault, notify) {
  try {
    const choice = await host.chooseFolder('pick');
    if (!choice) return;
    if (choice.hasData) {
      if (!window.confirm('That folder already has a planner. Switch to it? (Your current folder is left untouched.)')) return;
      await openVault(await host.useFolder(choice.path));
      notify('Opened planner folder');
      return;
    }
    const info = await host.useFolder(choice.path, { move: true });
    await host.save(JSON.stringify(state, null, 1));
    await openVault(info);
    const failed = info.attachments?.failed || [];
    if (failed.length) {
      notify(`Planner moved, but ${failed.length === 1 ? '1 attachment' : `${failed.length} attachments`} couldn’t be copied: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}. They are still in the old folder’s attachments folder.`, true);
    } else {
      notify('Planner moved to the new folder');
    }
  } catch {
    notify('That folder couldn’t be used. Check that you can save files there.', true);
  }
}

/**
 * Pick a daily backup (or a pre-restore safety copy) and bring it back.
 * `damaged`: planner.json couldn't be read, so it's set aside (renamed) rather
 * than copied into the backups.
 */
export function RestoreDialog({ onClose, damaged = false }) {
  const { replace, notify } = useStore();
  const [backups, setBackups] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { host.listBackups().then(setBackups).catch(() => setBackups([])); }, []);

  const restore = async (b) => {
    const when = formatDate(b.date, { weekday: 'long', month: 'long', day: 'numeric' });
    const ask = damaged
      ? `Bring back your planner from ${when}? The file that couldn’t be read stays in your planner folder, renamed.`
      : `Replace your planner with the version from ${when}? Your current planner is kept as a backup, and you can also undo right after.`;
    if (!window.confirm(ask)) return;
    setBusy(b.file);
    try {
      const data = JSON.parse(await host.readBackup(b.file));
      if (!data.years || !data.classes || !data.lessons) throw new Error('not a planner');
      if (damaged) await host.setAsideDamaged();
      else await host.snapshotBeforeRestore();
      replace(data);
      notify(`Restored your planner from ${when}.`, damaged ? undefined : { undo: true });
      onClose();
    } catch {
      notify('That backup could not be read.', true);
      setBusy(null);
    }
  };

  return (
    <Modal title="Restore an earlier version" onClose={onClose}>
      <p className="small">Teacher Planner saves a copy of your planner each day you use it and keeps the last 30 days. Restoring replaces everything — classes, lessons and grades — with that day’s copy.</p>
      {backups === null && <p className="small muted">Loading…</p>}
      {backups?.length === 0 && <p className="small muted">No backups yet. One is made the first time you change something each day.</p>}
      <ul className="list">
        {backups?.map((b) => (
          <li key={b.file}>
            <span className="grow">
              <strong>{formatDate(b.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>
              <span className="small muted"> · {b.beforeRestore ? `saved before a restore at ${new Date(b.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'daily backup'} · {Math.max(1, Math.round(b.size / 1024))} KB</span>
            </span>
            <button disabled={!!busy} onClick={() => restore(b)}>{busy === b.file ? 'Restoring…' : 'Restore'}</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
