import { useState } from 'react';
import { host, useStore } from '../lib/store.jsx';
import { chooseFolder } from './Welcome.jsx';
import { RestoreDialog } from './Settings.jsx';

/**
 * Desktop: planner.json is there but couldn't be read (damaged, or still
 * syncing). Nothing is saved until the teacher picks what to do, so the file
 * is never overwritten by accident.
 */
export default function LoadError() {
  const { vault, loadError, openVault, notify } = useStore();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      notify('Something went wrong. Please try again.', true);
    } finally {
      setBusy(false);
    }
  };
  const tryAgain = () => run(async () => openVault(await host.info()));
  const startOver = () => run(async () => {
    if (!window.confirm('Start over in this folder? The file that couldn’t be read is kept in the folder with a new name, so nothing is deleted.')) return;
    const file = await host.setAsideDamaged();
    await openVault(await host.info());
    if (file) notify(`The old file was kept as “${file}”.`);
  });

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo">⚠️</div>
        <h1>Your planner file couldn’t be read</h1>
        <p>
          The file <code>planner.json</code> in your planner folder is damaged or incomplete. If the folder is in OneDrive,
          Google Drive or Dropbox, it may still be syncing — wait a moment and try again.
        </p>
        <p className="small muted"><code>{vault?.vaultPath}</code>{loadError?.message ? <><br />{loadError.message}</> : null}</p>
        <button className="primary big" disabled={busy} onClick={() => setRestoring(true)}>
          Restore an earlier version…
          <span className="small">Bring back a daily backup from the last 30 days.</span>
        </button>
        <button className="big" disabled={busy} onClick={tryAgain}>
          Try again
          <span className="small">Read the file again, for example after syncing has finished.</span>
        </button>
        <button className="big" disabled={busy} onClick={() => host.openPath()}>
          Open the planner folder
          <span className="small">Look at the files yourself, or copy a backup over planner.json.</span>
        </button>
        <button className="big" disabled={busy} onClick={() => run(() => chooseFolder('pick', openVault))}>
          Choose another folder…
          <span className="small">Open a different planner folder. This one is left as it is.</span>
        </button>
        <button className="link-btn small" disabled={busy} onClick={startOver}>Start over with a new planner in this folder</button>
      </div>
      {restoring && <RestoreDialog damaged onClose={() => setRestoring(false)} />}
    </div>
  );
}
