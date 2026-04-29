const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_IPC_CHANNELS = new Set([
  'notes:list',
  'notes:get',
  'notes:create',
  'folders:create',
  'notes:update',
  'notes:delete',
  'notes:changed',
  'system:open-file',
  'system:switch-data-path',
  'system:import-data',
  'system:update',
  'system:restart',
  'ai:update-ollama',
  'desktop:api-request',
  'desktop:get-backend-base-url',
]);

contextBridge.exposeInMainWorld('electron', {
  ipcInvoke: (channel, payload) => {
    if (!ALLOWED_IPC_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload);
  },
  getBackendBaseUrl: () => ipcRenderer.invoke('desktop:get-backend-base-url'),
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
