import { useState } from 'react';
import { host, useStore, resetToDemo, resetToEmpty } from '../lib/store.jsx';
import { uid } from '../lib/model.js';
import { download } from '../components/ui.jsx';
import { today } from '../lib/dates.js';

export default function Settings() {
  const { state, update, replace, notify, userId, vault, openVault } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const me = state.users.find((u) => u.id === userId);

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
        <section className="card">
          <h2>My profile</h2>
          <div className="row"><input value={me.name} onChange={(e) => update((d) => { d.users.find((u) => u.id === userId).name = e.target.value; })} /></div>
          <div className="row"><input value={me.email} placeholder="Email" onChange={(e) => update((d) => { d.users.find((u) => u.id === userId).email = e.target.value; })} /></div>
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

        <section className="card">
          <h2>Lesson status tags</h2>
          {state.statuses.map((s, i) => (
            <div key={s.id} className="row">
              <input type="color" value={s.color} onChange={(e) => update((d) => { d.statuses[i].color = e.target.value; })} />
              <input value={s.name} onChange={(e) => update((d) => { d.statuses[i].name = e.target.value; })} className="grow" />
              <button className="icon-btn" onClick={() => update((d) => {
                d.statuses.splice(i, 1);
                for (const l of Object.values(d.lessons)) l.statusIds = l.statusIds.filter((x) => x !== s.id);
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
              </div>
              <p className="small muted">Version {vault.version}</p>
            </>
          ) : (
            <p className="small muted">Everything is stored in this browser. Export a backup regularly, or to move to another computer.</p>
          )}
          <div className="row wrap">
            <button className="primary" onClick={() => download(`teacher-planner-backup-${today()}.json`, JSON.stringify(state), 'application/json')}>Export backup</button>
            <label className="btn">Import backup<input type="file" accept="application/json,.json" hidden onChange={importBackup} /></label>
          </div>
          <div className="row wrap">
            <button onClick={() => { if (window.confirm('Replace everything with sample data?')) replace(resetToDemo()); }}>Load sample data</button>
            <button className="danger" onClick={() => { if (window.confirm('Erase everything and start fresh? Export a backup first if you need it.')) replace(resetToEmpty()); }}>Start fresh</button>
          </div>
        </section>
      </div>
    </div>
  );
}
