const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcInvoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  onVaultChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('vault:changed', handler);
    ipcRenderer.on('vault:batch-update', handler);
    return () => {
      ipcRenderer.removeListener('vault:changed', handler);
      ipcRenderer.removeListener('vault:batch-update', handler);
    };
  },
  onBeforeAppClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return () => ipcRenderer.removeListener('app:before-close', handler);
  },
  finishBeforeAppClose: () => ipcRenderer.send('app:before-close-complete'),
});
