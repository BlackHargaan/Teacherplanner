// The only bridge between the web UI and the computer's file system.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plannerHost', {
  info: () => ipcRenderer.invoke('vault:info'),
  // Ask for a folder ({ path, hasData }); nothing changes until useFolder().
  chooseFolder: (mode) => ipcRenderer.invoke('vault:choose', mode),
  // Switch to the chosen folder. { move: true } also copies attachments/ there.
  useFolder: (dir, opts) => ipcRenderer.invoke('vault:use', dir, opts),
  setAsideDamaged: () => ipcRenderer.invoke('vault:set-aside-damaged'),
  load: () => ipcRenderer.invoke('vault:load'),
  save: (json) => ipcRenderer.invoke('vault:save', json),
  saveSync: (json) => ipcRenderer.sendSync('vault:save-sync', json),
  saveAttachment: (name, data) => ipcRenderer.invoke('vault:save-attachment', { name, data }),
  openPath: (rel) => ipcRenderer.invoke('vault:open-path', rel),
  fetchCalendar: (url) => ipcRenderer.invoke('calendar:fetch', url),
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    openDownloadPage: () => ipcRenderer.invoke('update:download-page'),
    onStatus: (cb) => {
      const listener = (_e, status) => cb(status);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    },
  },
  listBackups: () => ipcRenderer.invoke('vault:list-backups'),
  readBackup: (file) => ipcRenderer.invoke('vault:read-backup', file),
  snapshotBeforeRestore: () => ipcRenderer.invoke('vault:snapshot-before-restore'),
  savePdf: (fileName) => ipcRenderer.invoke('pdf:save', fileName),
  openLastPdf: () => ipcRenderer.invoke('pdf:open-last'),
  onCommand: (cb) => {
    const listener = (_e, cmd) => cb(cmd);
    ipcRenderer.on('app:command', listener);
    return () => ipcRenderer.removeListener('app:command', listener);
  },
  onNavigate: (cb) => {
    const listener = (_e, path) => cb(path);
    ipcRenderer.on('app:navigate', listener);
    return () => ipcRenderer.removeListener('app:navigate', listener);
  },
  onExternalChange: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('vault:changed', listener);
    return () => ipcRenderer.removeListener('vault:changed', listener);
  },
});

// A file dropped anywhere the page doesn't handle it would otherwise replace
// the planner with that file. In-app drag and drop (no files) is untouched.
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });
