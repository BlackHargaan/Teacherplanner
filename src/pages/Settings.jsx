import { useEffect, useState } from 'react';
import { UpdatesCard } from '../components/Updates.jsx';
import { AccountCard } from '../components/CloudAccount.jsx';
import { useHashRoute } from '../lib/router.js';
import { host, useStore, resetToDemo, resetToEmpty } from '../lib/store.jsx';
import { uid } from '../lib/model.js';
import { Field, Modal, download } from '../components/ui.jsx';
import { formatDate } from '../lib/dates.js';
import { today } from '../lib/dates.js';
import { MODES, PALETTES } from '../data/themes.js';

export default function Settings() {
  const { state, update, replace, notify, userId, vault, openVault } = useStore();
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

  const importBackup = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((t) => {
      try {
        const data = JSON.parse(t);
        if (!data.years || !data.classes || !data.lessons) throw new Error('bad');
        if (!window.confirm('Replace all current data with this backup?')) return;
        replace(data);
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
        <section className="card wide">
          <h2>Appearance</h2>
          <div className="palette-grid">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                className={`palette-option ${(me.appearance?.palette || 'classic') === p.id ? 'on' : ''}`}
                onClick={() => setAppearance({ palette: p.id })}
                aria-pressed={(me.appearance?.palette || 'classic') === p.id}
              >
                <span className="palette-swatches"><span style={{ background: p.light }} /><span style={{ background: p.dark }} /></span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="row wrap">
            <span className="small">Light or dark</span>
            <div className="segmented" role="group" aria-label="Light or dark">
              {MODES.map(([id, label]) => (
                <button key={id} className={(me.appearance?.mode || 'auto') === id ? 'on' : ''} onClick={() => setAppearance({ mode: id })}>{label}</button>
              ))}
            </div>
          </div>
          <p className="small muted">Your colors are saved with your profile. Class and lesson-section colors are set on the Classes page.</p>
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

        <section className="card">
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

        <section className="card">
          <h2>Data</h2>
          {host && vault?.vaultPath ? (
            <>
              <p className="small">Your planner folder:<br /><code>{vault.vaultPath}</code></p>
              <p className="small muted">Saved automatically as you work, with a daily backup in its <code>backups</code> folder. Keep this folder in OneDrive, Google Drive or Dropbox to use the planner on more than one computer (one computer at a time).</p>
              <div className="row wrap">
                <button onClick={() => host.openPath()}>Open folder</button>
                <button onClick={async () => {
                  const info = await host.chooseFolder('pick');
                  if (!info) return;
                  if (info.hasData) {
                    if (!window.confirm('That folder already has a planner. Switch to it? (Your current folder is left untouched.)')) return;
                  } else {
                    await host.save(JSON.stringify(state, null, 1));
                  }
                  await openVault(info);
                  notify(info.hasData ? 'Opened planner folder' : 'Planner moved to the new folder');
                }}>Move / switch folder…</button>
                <button onClick={() => setRestoring(true)}>Restore an earlier version…</button>
              </div>
            </>
          ) : (
            <p className="small muted">Everything is stored in this browser. Export a backup regularly, or to move to another computer.</p>
          )}
          <div className="row wrap">
            <button className="primary" onClick={() => download(`teacher-planner-backup-${today()}.json`, JSON.stringify(state), 'application/json')}>Export backup</button>
            <label className="btn">Import backup<input type="file" accept="application/json,.json" hidden onChange={importBackup} /></label>
          </div>
          <div className="row wrap">
            <button onClick={() => { if (window.confirm('Replace everything with sample data?')) { replace(resetToDemo()); notify('Loaded the sample planner.', { undo: true }); } }}>Load sample data</button>
            <button className="danger" onClick={() => { if (window.confirm('Erase everything and start fresh?')) { replace(resetToEmpty()); notify('Started a fresh planner.', { undo: true }); } }}>Start fresh</button>
          </div>
        </section>
      </div>
      {restoring && <RestoreDialog onClose={() => setRestoring(false)} />}
    </div>
  );
}

/** Pick a daily backup (or a pre-restore safety copy) and bring it back. */
function RestoreDialog({ onClose }) {
  const { replace, notify } = useStore();
  const [backups, setBackups] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { host.listBackups().then(setBackups).catch(() => setBackups([])); }, []);

  const restore = async (b) => {
    const when = formatDate(b.date, { weekday: 'long', month: 'long', day: 'numeric' });
    if (!window.confirm(`Replace your planner with the version from ${when}? Your current planner is kept as a backup, and you can also undo right after.`)) return;
    setBusy(b.file);
    try {
      const data = JSON.parse(await host.readBackup(b.file));
      if (!data.years || !data.classes || !data.lessons) throw new Error('not a planner');
      await host.snapshotBeforeRestore();
      replace(data);
      notify(`Restored your planner from ${when}.`, { undo: true });
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
