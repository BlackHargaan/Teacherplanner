import { BrandMark } from '../components/BrandMark.jsx';
import { useState } from 'react';
import { host, useStore, resetToDemo, resetToEmpty } from '../lib/store.jsx';

/**
 * Pick a folder and open it. Nothing here is saved yet, so a folder that
 * already has a planner is simply opened.
 */
export async function chooseFolder(mode, openVault) {
  const choice = await host.chooseFolder(mode);
  if (!choice) return false;
  await openVault(await host.useFolder(choice.path));
  return true;
}

/** First run of the desktop app: pick the planner folder, then how to start. */
export default function Welcome() {
  const { vault, openVault, replace, notify } = useStore();
  const [busy, setBusy] = useState(false);

  if (!vault) return <div className="welcome"><p className="muted">Opening your planner…</p></div>;

  const choose = async (mode) => {
    setBusy(true);
    try {
      await chooseFolder(mode, openVault);
    } catch {
      notify('That folder couldn’t be used. Check that you can save files there.', true);
    } finally {
      setBusy(false);
    }
  };

  const importBackup = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    file?.text().then((t) => {
      try {
        const data = JSON.parse(t);
        if (!data.years || !data.classes) throw new Error('bad');
        replace(data);
      } catch {
        notify('That file is not a Teacher Planner backup.', true);
      }
    });
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <BrandMark size={56} className="welcome-logo" />
        <h1>Welcome to Teacher Planner</h1>
        {!vault.vaultPath ? (
          <>
            <p>Your plans are saved as ordinary files in a folder on this computer, so they belong to you and work without the internet.</p>
            <button className="primary big" disabled={busy} onClick={() => choose('default')}>
              Save my planner in Documents
              <span className="small">{vault.defaultPath}</span>
            </button>
            <button className="big" disabled={busy} onClick={() => choose('pick')}>
              Choose another folder…
              <span className="small">Pick a folder inside OneDrive, Google Drive or Dropbox to use the planner on several computers, or open a planner folder you already have.</span>
            </button>
          </>
        ) : (
          <>
            <p>Your planner folder is ready:<br /><code>{vault.vaultPath}</code></p>
            <button className="primary big" onClick={() => replace(resetToDemo())}>
              Start with sample classes
              <span className="small">Explore with example lessons, a roster and grades. You can clear them later in Settings.</span>
            </button>
            <button className="big" onClick={() => replace(resetToEmpty())}>
              Start with an empty planner
              <span className="small">Set up your school year and classes from scratch.</span>
            </button>
            <label className="btn big">
              Import a backup file…
              <span className="small">A .json backup exported from Teacher Planner.</span>
              <input type="file" accept=".json,application/json" hidden onChange={importBackup} />
            </label>
            <button className="link-btn small" onClick={() => choose('pick')}>Use a different folder</button>
          </>
        )}
      </div>
    </div>
  );
}
