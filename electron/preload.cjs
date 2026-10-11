// The only bridge between the web UI and the computer's file system.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plannerHost', {
  info: () => ipcRenderer.invoke('vault:info'),
  chooseFolder: (mode) => ipcRenderer.invoke('vault:choose', mode),
  load: () => ipcRenderer.invoke('vault:load'),
  save: (json) => ipcRenderer.invoke('vault:save', json),
  saveSync: (json) => ipcRenderer.sendSync('vault:save-sync', json),
  saveAttachment: (name, data) => ipcRenderer.invoke('vault:save-attachment', { name, data }),
  openPath: (rel) => ipcRenderer.invoke('vault:open-path', rel),
  onExternalChange: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('vault:changed', listener);
    return () => ipcRenderer.removeListener('vault:changed', listener);
  },
});
