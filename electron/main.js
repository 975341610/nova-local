const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { createFsBridge } = require('./fsBridge');
const { createVaultWatcher } = require('./vaultWatcher');

const APP_ROOT = path.resolve(__dirname, '..');
const FRONTEND_INDEX = path.join(APP_ROOT, 'frontend_dist', 'index.html');
function resolveDataRoot({ appRoot = APP_ROOT, env = process.env } = {}) {
  if (env.NOVA_DATA_ROOT) {
    return path.resolve(env.NOVA_DATA_ROOT);
  }

  const configPath = path.join(appRoot, 'data_config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      if (typeof config.data_path === 'string' && config.data_path.trim()) {
        return path.resolve(config.data_path);
      }
    }
  } catch (error) {
    console.warn(`[config] Failed to read data_config.json: ${error.message}`);
  }

  return path.join(appRoot, 'data');
}

const DATA_ROOT = resolveDataRoot();
const VAULT_ROOT = path.join(DATA_ROOT, 'vault');
const DESKTOP_LOCAL_TOKEN = process.env.NOVA_DESKTOP_TOKEN || crypto.randomBytes(24).toString('hex');
const BACKEND_HOST = process.env.NOVA_BACKEND_HOST || '127.0.0.1';
const parsedBackendPort = Number.parseInt(process.env.NOVA_BACKEND_PORT || process.env.PORT || '8765', 10);
const BACKEND_PORT = Number.isFinite(parsedBackendPort) ? parsedBackendPort : 8765;
const BACKEND_ORIGIN = (process.env.NOVA_BACKEND_ORIGIN || `http://${BACKEND_HOST}:${BACKEND_PORT}`).replace(/\/+$/, '');
const BACKEND_API_BASE = (process.env.NOVA_BACKEND_API_BASE || `${BACKEND_ORIGIN}/api`).replace(/\/+$/, '');

let mainWindow = null;
let backendProcess = null;
let watcher = null;
let allowWindowClose = false;
let isAppQuitting = false;
let backendRestartTimer = null;
let backendRestartAttempts = 0;
let backendLastError = null;
const recentLocalVaultChanges = new Map();

const fsBridge = createFsBridge({ vaultRoot: VAULT_ROOT });

const DESKTOP_API_REQUESTS = new Map([
  ['config:get-model', { method: 'GET', path: '/model-config' }],
  ['config:update-model', { method: 'POST', path: '/model-config' }],
  ['ai:toggle-plugin', { method: 'POST', path: '/ai/toggle-plugin' }],
  ['system:vault-health', { method: 'GET', path: '/system/vault-health' }],
]);

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

  // Ignore changes in internal resource directories
  if (normalizedFilename.startsWith('_assets\\') || normalizedFilename.startsWith('_templates\\') || normalizedFilename.startsWith('data\\media\\')) {
    return true; // Pretend it was a recent local change to bypass watcher
  }

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
    const req = http.get(`${BACKEND_ORIGIN}/health`, (res) => {
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

function resolveBackendLauncher({
  appRoot = APP_ROOT,
  platform = process.platform,
  env = process.env,
  resourcesPath = process.resourcesPath,
  isPackaged = app.isPackaged,
} = {}) {
  const pythonExecutable = platform === 'win32' ? 'python.exe' : 'python';
  const pythonBin = platform === 'win32' ? path.join('Scripts', pythonExecutable) : path.join('bin', pythonExecutable);
  const fallbackCommand = platform === 'win32' ? 'python' : 'python3';
  const candidates = [
    env.NOVA_BACKEND_PYTHON,
    isPackaged && resourcesPath ? path.join(resourcesPath, 'python', pythonBin) : null,
    path.join(appRoot, '.venv', pythonBin),
    fallbackCommand,
  ].filter(Boolean);

  const command = candidates.find((candidate) => {
    if (candidate === fallbackCommand) {
      return true;
    }
    return fs.existsSync(candidate);
  }) || fallbackCommand;

  return {
    command,
    args: [path.join(appRoot, 'start_backend.py')],
  };
}

function scheduleBackendRestart(reason = 'exit') {
  if (isAppQuitting || backendRestartTimer) {
    return;
  }

  backendRestartAttempts += 1;
  const delayMs = Math.min(5000, 500 * (2 ** (backendRestartAttempts - 1)));
  console.warn(`[backend] process ${reason}, scheduling restart in ${delayMs}ms`);

  backendRestartTimer = setTimeout(async () => {
    backendRestartTimer = null;
    try {
      await ensureBackend();
      backendRestartAttempts = 0;
      console.info('[backend] restart successful');
    } catch (error) {
      console.error('[backend] restart failed', error);
      scheduleBackendRestart('restart-failed');
    }
  }, delayMs);
}

function startBackendProcess() {
  if (backendProcess) {
    return;
  }

  const logsDir = path.join(DATA_ROOT, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const stdoutLog = fs.createWriteStream(path.join(logsDir, 'backend.stdout.log'), { flags: 'a' });
  const stderrLog = fs.createWriteStream(path.join(logsDir, 'backend.stderr.log'), { flags: 'a' });

  const launcher = resolveBackendLauncher();
  backendProcess = spawn(launcher.command, launcher.args, {
    cwd: APP_ROOT,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NOVA_DESKTOP_TOKEN: DESKTOP_LOCAL_TOKEN,
      RUN_MODE: 'desktop_local',
      HOST: BACKEND_HOST,
      PORT: String(BACKEND_PORT),
    },
  });

  backendProcess.stdout.on('data', (chunk) => {
    stdoutLog.write(chunk);
    console.info(`[backend] ${chunk.toString().trimEnd()}`);
  });

  backendProcess.stderr.on('data', (chunk) => {
    stderrLog.write(chunk);
    backendLastError = chunk.toString().trim();
    console.error(`[backend] ${backendLastError}`);
  });

  backendProcess.on('error', (error) => {
    backendLastError = error.message;
    stdoutLog.end();
    stderrLog.end();
    backendProcess = null;
    console.error('[backend] failed to start', error);
  });

  backendProcess.on('exit', (code, signal) => {
    stdoutLog.end();
    stderrLog.end();
    backendProcess = null;
    if (!isAppQuitting) {
      scheduleBackendRestart(`exit(code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    }
  });
}

async function ensureBackend() {
  if (await checkBackend()) {
    return;
  }

  startBackendProcess();

  const maxAttempts = 90;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await checkBackend(1200)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const detail = backendLastError ? ` Last backend error: ${backendLastError}` : '';
  throw new Error(`Backend unavailable at ${BACKEND_ORIGIN}.${detail}`);
}

async function bootstrapApp() {
  await fsBridge.ensureBaseDirs();
  await ensureBackend();
  registerIpcHandlers();
  createMainWindow();

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

    vaultChangeQueue.push(payload);
    if (!vaultChangeTimer) {
      vaultChangeTimer = setTimeout(flushVaultChanges, 1000);
    }
  });
  watcher.start();
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
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    try {
      const rawUrl = details.url || '';
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'file:') {
        callback({});
        return;
      }

      const pathname = decodeURIComponent(parsed.pathname || '').replace(/\\/g, '/');
      const legacyApiMatch = pathname.match(/^\/?[A-Za-z]:\/api(\/.*)?$/i);
      if (!legacyApiMatch) {
        callback({});
        return;
      }

      callback({ redirectURL: `${BACKEND_ORIGIN}/api${legacyApiMatch[1] || ''}` });
    } catch {
      callback({});
    }
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

function ensurePlainObject(payload, label = 'payload') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} must be an object`);
  }
  return payload;
}

function ensureInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function isPathInsideRoot(root, targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function pathFromBackendMediaUrl(rawPath) {
  if (typeof rawPath !== 'string') {
    return null;
  }

  const mediaPrefixes = [
    { prefix: '/api/media/static/files/', root: path.join(VAULT_ROOT, '_assets') },
    { prefix: '/api/media/files/', root: path.join(VAULT_ROOT, '_assets') },
    { prefix: '/api/media/static/music/', root: path.join(DATA_ROOT, 'music') },
  ];

  try {
    const parsed = new URL(rawPath, BACKEND_ORIGIN);
    if (parsed.origin !== BACKEND_ORIGIN && parsed.hostname !== BACKEND_HOST) {
      return null;
    }
    for (const item of mediaPrefixes) {
      if (parsed.pathname.startsWith(item.prefix)) {
        const relativePath = decodeURIComponent(parsed.pathname.slice(item.prefix.length));
        return path.resolve(item.root, relativePath);
      }
    }
  } catch {
    // Treat non-URL strings as filesystem paths below.
  }

  for (const item of mediaPrefixes) {
    if (rawPath.startsWith(item.prefix)) {
      const relativePath = decodeURIComponent(rawPath.slice(item.prefix.length));
      return path.resolve(item.root, relativePath);
    }
  }
  return null;
}

function resolveOpenFilePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('path is required');
  }

  const fromMediaUrl = pathFromBackendMediaUrl(rawPath.trim());
  const targetPath = fromMediaUrl || (path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(path.join(VAULT_ROOT, '_assets'), rawPath));

  const allowedRoots = [
    VAULT_ROOT,
    path.join(VAULT_ROOT, '_assets'),
    path.join(DATA_ROOT, 'music'),
  ];

  if (!allowedRoots.some((root) => isPathInsideRoot(root, targetPath))) {
    throw new Error('File path is outside allowed roots');
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`File not found: ${targetPath}`);
  }
  return targetPath;
}

async function openLocalFile(payload) {
  const input = ensurePlainObject(payload);
  const targetPath = resolveOpenFilePath(input.path);
  const error = await shell.openPath(targetPath);
  if (error) {
    throw new Error(error);
  }
  return { status: 'ok' };
}

function runUpdateOllama() {
  const scriptPath = path.join(APP_ROOT, 'ensure_ollama.py');
  if (!fs.existsSync(scriptPath)) {
    throw new Error('Update script not found');
  }

  const launcher = resolveBackendLauncher();
  return new Promise((resolve, reject) => {
    const child = spawn(launcher.command, [scriptPath, '--force'], {
      cwd: APP_ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      const output = Buffer.concat(stdout).toString('utf8');
      const message = Buffer.concat(stderr).toString('utf8');
      if (code === 0) {
        resolve({ status: 'success', output });
      } else {
        resolve({ status: 'error', message });
      }
    });
  });
}

function normalizeDesktopApiRequest(payload) {
  const input = ensurePlainObject(payload);
  if (typeof input.channel !== 'string') {
    throw new Error('channel must be a string');
  }

  const allowed = DESKTOP_API_REQUESTS.get(input.channel);
  if (!allowed) {
    throw new Error(`Desktop API channel not allowed: ${input.channel}`);
  }
  if (input.path !== allowed.path) {
    throw new Error(`Desktop API path not allowed for ${input.channel}`);
  }

  const options = input.options === undefined ? {} : ensurePlainObject(input.options, 'options');
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== allowed.method) {
    throw new Error(`Desktop API method not allowed for ${input.channel}`);
  }
  if (options.body !== undefined && typeof options.body !== 'string') {
    throw new Error('body must be a string');
  }

  return {
    method,
    path: allowed.path,
    body: options.body,
  };
}

function requestBackendApi(payload) {
  const request = normalizeDesktopApiRequest(payload);
  const targetUrl = new URL(`${BACKEND_API_BASE}${request.path}`);
  const transport = targetUrl.protocol === 'https:' ? https : http;
  const body = request.body;
  const headers = {
    'x-nova-desktop-token': DESKTOP_LOCAL_TOKEN,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(targetUrl, {
      method: request.method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(text || `Backend request failed with ${res.statusCode}`));
          return;
        }
        if (!text) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(text);
        }
      });
    });

    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

function pickNoteWritePayload(payload) {
  const source = ensurePlainObject(payload);
  const allowedKeys = [
    'id',
    'title',
    'content',
    'notebook_id',
    'icon',
    'parent_id',
    'is_title_manually_edited',
    'tags',
    'type',
    'file_path',
    'background_paper',
    'sort_key',
    'stickers',
    'sticky_notes',
    'properties',
    'rename_file',
  ];

  const sanitized = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      sanitized[key] = source[key];
    }
  }
  return sanitized;
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:api-request', async (_event, payload) => requestBackendApi(payload));
  ipcMain.handle('desktop:get-backend-base-url', async () => BACKEND_API_BASE);
  ipcMain.handle('system:open-file', async (_event, payload) => openLocalFile(payload));
  ipcMain.handle('ai:update-ollama', async () => runUpdateOllama());
  ipcMain.handle('notes:list', async (_event, payload = {}) => {
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    return fsBridge.listNotes({ includeContent: input.includeContent === true });
  });
  ipcMain.handle('notes:get', async (_event, payload) => {
    const input = ensurePlainObject(payload);
    return fsBridge.getNote(ensureInteger(input.id, 'id'));
  });
  ipcMain.handle('notes:changed', async (_event, payload = {}) => {
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    return fsBridge.getNotesByPaths(input.filenames, { includeContent: input.includeContent !== false });
  });
  ipcMain.handle('notes:create', async (_event, payload) => {
    const input = pickNoteWritePayload(payload);
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new Error('title is required');
    }
    const created = await fsBridge.createNote(input);
    markLocalVaultChange(created.file_path);
    return created;
  });
  ipcMain.handle('folders:create', async (_event, payload) => {
    const input = ensurePlainObject(payload);
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new Error('title is required');
    }
    const created = await fsBridge.createFolder(input);
    markLocalVaultChange(created.file_path);
    return created;
  });
  ipcMain.handle('notes:update', async (_event, payload) => {
    const input = pickNoteWritePayload(payload);
    const noteId = ensureInteger(input.id, 'id');
    if (typeof input.file_path === 'string') {
      markLocalVaultChange(input.file_path);
    }
    const updated = await fsBridge.updateNote(noteId, input);
    markLocalVaultChange(updated.file_path);
    return updated;
  });
  ipcMain.handle('notes:delete', async (_event, payload) => {
    const input = ensurePlainObject(payload);
    return fsBridge.deleteNote(ensureInteger(input.id, 'id'));
  });
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

app.whenReady().then(bootstrapApp).catch((error) => {
  console.error('[main] failed to bootstrap application', error);
  dialog.showErrorBox('Nova startup failed', error?.message || String(error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }
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
