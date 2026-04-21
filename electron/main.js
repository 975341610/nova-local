const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain } = require('electron');
const { createFsBridge } = require('./fsBridge');
const { createVaultWatcher } = require('./vaultWatcher');

const APP_ROOT = path.resolve(__dirname, '..');
const FRONTEND_INDEX = path.join(APP_ROOT, 'frontend_dist', 'index.html');
const VENV_PYTHON = path.join(APP_ROOT, '.venv', 'Scripts', 'python.exe');
const VAULT_ROOT = path.join(APP_ROOT, 'data', 'vault');

let mainWindow = null;
let backendProcess = null;
let watcher = null;
let allowWindowClose = false;
const recentLocalVaultChanges = new Map();

const fsBridge = createFsBridge({ vaultRoot: VAULT_ROOT });

function normalizeVaultRelativePath(targetPath) {
  return targetPath.replace(/\//g, '\\').toLowerCase();
}

function markLocalVaultChange(targetPath) {
  if (!targetPath) {
    return;
  }

  const relativePath = path.relative(VAULT_ROOT, targetPath);
  if (!relativePath || relativePath.startsWith('..')) {
    return;
  }

  const key = normalizeVaultRelativePath(relativePath);
  recentLocalVaultChanges.set(key, Date.now() + 3000); // 延长静音期到 3s

  const parentRelativePath = path.dirname(relativePath);
  if (parentRelativePath && parentRelativePath !== '.' && parentRelativePath !== relativePath) {
    recentLocalVaultChanges.set(normalizeVaultRelativePath(parentRelativePath), Date.now() + 1500);
  }
}

function isRecentLocalVaultChange(filename) {
  if (!filename) {
    return false;
  }

  const now = Date.now();
  
  // 转换 incoming filename 为相对于 VAULT_ROOT 的路径，并进行归一化
  let relativeFilename = filename;
  if (path.isAbsolute(filename)) {
    relativeFilename = path.relative(VAULT_ROOT, filename);
  }
  
  // 如果路径在库外部，不属于库变更，直接忽略
  if (relativeFilename.startsWith('..')) {
    return false;
  }

  const normalizedFilename = normalizeVaultRelativePath(relativeFilename);

  for (const [key, expiresAt] of recentLocalVaultChanges.entries()) {
    if (expiresAt <= now) {
      recentLocalVaultChanges.delete(key);
      continue;
    }
    if (normalizedFilename === key || normalizedFilename.startsWith(`${key}\\`)) {
      return true;
    }
  }
  return false;
}

function checkBackend(timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8765/health', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureBackend() {
  if (await checkBackend()) {
    return;
  }

  backendProcess = spawn(VENV_PYTHON, ['start_backend.py'], {
    cwd: APP_ROOT,
    windowsHide: true,
    stdio: 'ignore',
  });

  backendProcess.on('exit', () => {
    backendProcess = null;
  });

  const maxAttempts = 40;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await checkBackend(1200)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f5efe6',
    title: 'Nova',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(FRONTEND_INDEX);
  mainWindow.on('close', (event) => {
    if (allowWindowClose || !mainWindow) {
      return;
    }

    event.preventDefault();

    let settled = false;
    const finalizeClose = () => {
      if (settled || !mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      settled = true;
      allowWindowClose = true;
      mainWindow.close();
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      ipcMain.removeListener('app:before-close-complete', handleRendererReady);
    };

    const handleRendererReady = () => {
      cleanup();
      finalizeClose();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      finalizeClose();
    }, 1500);

    ipcMain.on('app:before-close-complete', handleRendererReady);
    mainWindow.webContents.send('app:before-close');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowWindowClose = false;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('notes:list', async (_event, payload = {}) => (
    fsBridge.listNotes({ includeContent: Boolean(payload.includeContent) })
  ));
  ipcMain.handle('notes:get', async (_event, payload) => fsBridge.getNote(payload.id));
  ipcMain.handle('notes:create', async (_event, payload) => {
    const created = await fsBridge.createNote(payload);
    markLocalVaultChange(created.file_path);
    return created;
  });
  ipcMain.handle('folders:create', async (_event, payload) => {
    const created = await fsBridge.createFolder(payload);
    markLocalVaultChange(created.file_path);
    return created;
  });
  ipcMain.handle('notes:update', async (_event, payload) => {
    markLocalVaultChange(payload.file_path);
    const updated = await fsBridge.updateNote(payload.id, payload);
    markLocalVaultChange(updated.file_path);
    return updated;
  });
  ipcMain.handle('notes:delete', async (_event, payload) => fsBridge.deleteNote(payload.id));
}

let vaultChangeQueue = [];
let vaultChangeTimer = null;

function flushVaultChanges() {
  if (vaultChangeQueue.length === 0) {
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    // 合并去重，以 filename 为键保留最后一次变更
    const mergedChanges = Array.from(
      vaultChangeQueue.reduce((acc, change) => {
        acc.set(change.filename, change);
        return acc;
      }, new Map()).values()
    );

    mainWindow.webContents.send('vault:batch-update', mergedChanges);
  }

  vaultChangeQueue = [];
  vaultChangeTimer = null;
}

app.whenReady().then(async () => {
  await fsBridge.ensureBaseDirs();
  await ensureBackend();
  registerIpcHandlers();
  createMainWindow();

  // 异步修复元数据和初始化 ID 缓存
  setImmediate(async () => {
    await fsBridge.repairVaultMetadata();
    await fsBridge.initializeMaxId();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:ready');
    }
  });

  watcher = createVaultWatcher(VAULT_ROOT, (payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (isRecentLocalVaultChange(payload.filename)) {
      return;
    }
    
    // 批量防抖处理
    vaultChangeQueue.push(payload);
    if (!vaultChangeTimer) {
      vaultChangeTimer = setTimeout(flushVaultChanges, 1000); // 增加前端防抖时间到 1s
    }
  });
  watcher.start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  watcher?.stop();
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
