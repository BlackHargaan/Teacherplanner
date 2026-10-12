import { useEffect, useState } from 'react';
import { host } from '../lib/store.jsx';

/** Live update status from the desktop app; null in the browser version. */
export function useUpdateStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!host?.updates) return undefined;
    let alive = true;
    host.updates.status().then((s) => alive && setStatus(s));
    const off = host.updates.onStatus(setStatus);
    return () => { alive = false; off(); };
  }, []);
  return status;
}

const timeAgo = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

/** Settings → Updates */
export function UpdatesCard() {
  const status = useUpdateStatus();
  const [busy, setBusy] = useState(false);
  if (!host?.updates || !status) return null;

  const check = async () => {
    setBusy(true);
    try { await host.updates.check(); } finally { setBusy(false); }
  };
  const { state, version, percent, currentVersion, manualDownload } = status;
  const downloadButton = <button className="primary" onClick={() => host.updates.openDownloadPage()}>Download from the website</button>;

  return (
    <section className="card" id="updates">
      <h2>Updates</h2>
      <p className="small">You have version <strong>{currentVersion}</strong>.</p>
      <div className="update-status" role="status" aria-live="polite">
        {state === 'unsupported' && <p className="small muted">Update checks only run in the installed app.</p>}
        {state === 'idle' && <p className="small muted">Teacher Planner checks for updates automatically.</p>}
        {state === 'checking' && <p className="small">Checking for updates…</p>}
        {state === 'up-to-date' && <p className="small">✓ You have the newest version. <span className="muted">Checked at {timeAgo(status.checkedAt)}.</span></p>}
        {state === 'downloading' && (
          <>
            <p className="small">Downloading version {version}… {percent ? `${percent}%` : ''}</p>
            <div className="meter"><div style={{ width: `${percent || 0}%` }} /></div>
          </>
        )}
        {state === 'ready' && (
          <>
            <p className="small"><strong>Version {version} is ready.</strong> Restart Teacher Planner to finish updating — your plans are saved first.</p>
            <div className="row"><button className="primary" onClick={() => host.updates.install()}>Restart to update</button></div>
          </>
        )}
        {state === 'available' && (
          <>
            <p className="small"><strong>Version {version} is available.</strong> Download it from the website, open it and drag Teacher Planner into Applications to replace this version. Your plans stay in your planner folder.</p>
            <div className="row">{downloadButton}</div>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="small">Couldn’t check for updates. Check your internet connection and try again, or download the newest version from the website.</p>
            <div className="row wrap">
              <button onClick={() => host.updates.openDownloadPage()}>Open the website</button>
            </div>
          </>
        )}
      </div>
      {!['downloading', 'ready', 'unsupported'].includes(state) && (
        <div className="row">
          <button onClick={check} disabled={busy || state === 'checking'}>{state === 'checking' ? 'Checking…' : 'Check for updates'}</button>
        </div>
      )}
      {manualDownload
        ? <p className="small muted">On Mac, new versions are downloaded from the Teacher Planner website.</p>
        : <p className="small muted">Updates download in the background and install the next time Teacher Planner restarts.</p>}
    </section>
  );
}

/** Thin banner under the top bar when an update is ready or available. */
export function UpdateBanner() {
  const status = useUpdateStatus();
  const [dismissed, setDismissed] = useState(null);
  if (!status || !['ready', 'available'].includes(status.state) || dismissed === status.version) return null;
  return (
    <div className="update-banner no-print" role="status">
      <span className="grow">
        {status.state === 'ready'
          ? <>Version {status.version} of Teacher Planner is ready.</>
          : <>Version {status.version} of Teacher Planner is available.</>}
      </span>
      {status.state === 'ready'
        ? <button className="primary" onClick={() => host.updates.install()}>Restart to update</button>
        : <button className="primary" onClick={() => host.updates.openDownloadPage()}>Download</button>}
      <button onClick={() => setDismissed(status.version)}>Later</button>
    </div>
  );
}
