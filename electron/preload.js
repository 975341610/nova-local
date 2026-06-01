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
  'system:open-url',
  'system:switch-data-path',
  'system:import-data',
  'system:update',
  'system:restart',
  'ai:update-ollama',
  'desktop:api-request',
  'desktop:window-control',
  'desktop:get-backend-base-url',
  // M4 Updater IPC surface (registered in electron/updaterBridge.js)
  'updater:get-current-version',
  'updater:get-rollback-target',
  'updater:list-versions',
  'updater:verify',
  'updater:import',
  'updater:install',
  'updater:switch-to',
  'updater:pick-file',
  'updater:read-crash-log',
  // M5 Health & crash management
  'updater:mark-healthy',
  'updater:mark-failed',
  'updater:record-crash',
  'updater:auto-rollback-if-needed',
  // v0.23.3 HTTP auto-update
  'updater:check-remote',
  'updater:download-and-install',
  // v0.23.4 note revision history (companion to DESKTOP_API_REQUESTS
  // pathPattern support in electron/main.js)
  'notes:revisions:list',
  'notes:revisions:get',
  'notes:revisions:restore',
  'notes:snapshot',
  'system:revision-settings:get',
  'system:revision-settings:update',
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
  onRevisionSnapshotStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('revision:snapshot-status', handler);
    return () => ipcRenderer.removeListener('revision:snapshot-status', handler);
  },
  finishBeforeAppClose: () => ipcRenderer.send('app:before-close-complete'),
});
