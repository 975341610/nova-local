const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const {app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const { createFsBridge } = require('./fsBridge');
const { createVaultWatcher } = require('./vaultWatcher');
const {
  bootstrapVersionedLayout,
  resolveCurrentSlot,
  registerIpc: registerUpdaterIpc,
} = require('./updaterBridge');

// v0.21.9 hotfix · 禁掉 Chromium HTTP 磁盘缓存
// ------------------------------------------------------------
// 现象: 控制台报 "Failed to load resource: net::ERR_CACHE_OPERATION_NOT_SUPPORTED"
// 根因: 页面用 file:// 载入, 而 webRequest.onBeforeRequest 会把 file:// 下的
//       /[drive]:/api/... 重定向到 http://127.0.0.1:8765/api/..., 跨协议重定向
//       让 disk_cache 在某些请求上返回 OPERATION_NOT_SUPPORTED.
// 方案: 我们的后端都是本地 127.0.0.1, 不需要 HTTP 缓存; 直接关掉最干净.
// 必须在 app.whenReady() 之前执行.
app.commandLine.appendSwitch('disable-http-cache');
// Keep Chromium crisp when the window moves between monitors with different DPI.
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('enable-use-zoom-for-dsf', 'true');

// v0.23.2 · NTFS junction 兜底
// ---------------------------------------------------------------
// Windows 上 versions/<ver>/ 通过 `current` directory junction 暴露给运行时,
// 而 Node.js 的 __dirname 会把 junction 解析到真实目标路径
// (e.g. C:\AI\nova-local\versions\0.23.1\electron),
// 导致 path.resolve(__dirname, '..') 落到 versions/<ver>/ 而非真正的 NovaRoot.
// 一旦 APP_ROOT 错位, bootstrapVersionedLayout 会把 versions/<ver>/backend
// 再往里塞一层, 触发 EBUSY rename 与无限递归.
// 解法: 优先信 NOVA_APP_ROOT 环境变量 (由 start_windows.bat 传入),
// 缺省时再回退到 __dirname 推导.
const APP_ROOT = process.env.NOVA_APP_ROOT
  ? path.resolve(process.env.NOVA_APP_ROOT)
  : path.resolve(__dirname, '..');

// v0.23.0 · 版本化布局 bootstrap
// ---------------------------------------------------------------
// 早期版本 (≤ v0.22.x) 的 APP_ROOT 下直接是 backend/ electron/ frontend_dist/,
// v0.23.0 起改为 versions/<X.Y.Z>/... + current 软链接指向当前运行版本.
// 首次从老布局启动时, 此调用会把裸文件搬进 versions/<现版本>/ 并建立 current 软链接.
// 若已经是版本化布局 (或已有 current 链接), 此调用为 no-op.
// data/ 永不被迁移或触碰.
try {
  bootstrapVersionedLayout(APP_ROOT);
} catch (error) {
  console.warn(`[updater] bootstrap skipped: ${error.message}`);
}

// 解析 current 指向的真实 slot, 没有就回退到 APP_ROOT 本身 (理论上不会发生).
const CURRENT_SLOT = resolveCurrentSlot(APP_ROOT) || APP_ROOT;
const FRONTEND_INDEX = path.join(CURRENT_SLOT, 'frontend_dist', 'index.html');
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
const revisionSnapshotTimers = new Map();
const revisionSnapshotQueue = [];
let revisionSnapshotDrainPromise = null;
let revisionSnapshotDrainTimer = null;
const REVISION_FINAL_SNAPSHOT_DELAY_MS = 3_000;
const CLOSE_WINDOW_RENDERER_FLUSH_TIMEOUT_MS = 5_000;
const MAX_REVISION_SNAPSHOT_ATTEMPTS = 3;
const REVISION_SNAPSHOT_QUEUE_PATH = path.join(DATA_ROOT, 'revision-snapshot-queue.json');

const fsBridge = createFsBridge({ vaultRoot: VAULT_ROOT });

const DESKTOP_API_REQUESTS = new Map([
  ['config:get-model', { method: 'GET', path: '/model-config' }],
  ['config:update-model', { method: 'POST', path: '/model-config' }],
  ['ai:toggle-plugin', { method: 'POST', path: '/ai/toggle-plugin' }],
  ['system:vault-health', { method: 'GET', path: '/system/vault-health' }],
  ['system:revision-settings:get', { method: 'GET', path: '/system/revision-settings' }],
  ['system:revision-settings:update', { method: 'PUT', path: '/system/revision-settings' }],
  // v0.23.4: parameterized paths use a RegExp; normalizeDesktopApiRequest
  // matches input.path against pathPattern when present, otherwise falls back
  // to literal `path` equality. This lets the renderer reach per-note revision
  // endpoints over the same `desktop:api-request` channel without growing
  // a separate IPC handler per route.
  ['notes:revisions:list', {
    method: 'GET',
    pathPattern: /^\/notes\/\d+\/revisions$/,
  }],
  ['notes:revisions:get', {
    method: 'GET',
    pathPattern: /^\/notes\/\d+\/revisions\/\d+$/,
  }],
  ['notes:revisions:restore', {
    method: 'POST',
    pathPattern: /^\/notes\/\d+\/revisions\/\d+\/restore$/,
  }],
  ['notes:snapshot', {
    method: 'POST',
    pathPattern: /^\/notes\/\d+\/snapshot$/,
  }],
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

  // Some machines need extra time after an update because Python imports,
  // SQLite/vault repair, or antivirus scans can delay the first /health.
  // Do not declare startup failed while the backend is still coming up.
  const maxAttempts = 240;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await checkBackend(2000)) {
      return;
    }
    if ((attempt + 1) % 20 === 0) {
      console.info(`[backend] waiting for health check ${attempt + 1}/${maxAttempts} at ${BACKEND_ORIGIN}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const detail = backendLastError ? ` Last backend error: ${backendLastError}` : '';
  throw new Error(`Backend unavailable at ${BACKEND_ORIGIN}.${detail}`);
}

async function bootstrapApp() {
  await fsBridge.ensureBaseDirs();
  await ensureBackend();
  loadRevisionSnapshotQueue();
  void drainRevisionSnapshotQueue();
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
    autoHideMenuBar: true,
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f5efe6',
    frame: false,
    title: '清知',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  
  // QINGZHI_HIDE_NATIVE_MENU_V34
  try {
    if (typeof Menu !== 'undefined' && Menu.setApplicationMenu) Menu.setApplicationMenu(null);
    if (mainWindow.setMenuBarVisibility) mainWindow.setMenuBarVisibility(false);
    if (mainWindow.setAutoHideMenuBar) mainWindow.setAutoHideMenuBar(true);
  } catch (error) {
    console.warn('[qingzhi] hide native menu failed:', error?.message || error);
  }
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

  // v0.21.9 hotfix · 清理一次历史磁盘缓存, 避免升级后首屏仍命中旧条目导致 OPERATION_NOT_SUPPORTED
  mainWindow.webContents.session
    .clearCache()
    .catch((err) => console.warn('[cache] clearCache failed:', err?.message || err));

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
      flushPendingRevisionSnapshotTimers();
      persistRevisionSnapshotQueue();
      finalizeClose();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      finalizeClose();
    }, CLOSE_WINDOW_RENDERER_FLUSH_TIMEOUT_MS);

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

function isTrustedRendererUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'file:') {
      let filePath = decodeURIComponent(parsed.pathname || '');
      if (process.platform === 'win32') {
        filePath = filePath.replace(/^\/([A-Za-z]:\/)/, '$1');
      }
      return path.resolve(filePath) === path.resolve(FRONTEND_INDEX);
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    }
  } catch {
    return false;
  }
  return false;
}

function requireTrustedIpcSender(event) {
  const rawUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  if (!isTrustedRendererUrl(rawUrl)) {
    throw new Error('Untrusted IPC sender');
  }
}

function trustedIpcHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    requireTrustedIpcSender(event);
    return handler(event, ...args);
  });
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
  return runProcess(launcher.command, [scriptPath, '--force'], { cwd: APP_ROOT })
    .then((result) => (
      result.code === 0
        ? { status: 'success', output: result.stdout }
        : { status: 'error', message: result.stderr }
    ));
}

function switchDataPath(payload) {
  const input = ensurePlainObject(payload);
  if (typeof input.data_path !== 'string' || !input.data_path.trim()) {
    throw new Error('data_path is required');
  }

  const newPath = path.resolve(input.data_path);
  const oldPath = path.resolve(DATA_ROOT);
  if (newPath === oldPath) {
    return { status: 'ok', message: 'Path is same' };
  }

  fs.mkdirSync(newPath, { recursive: true });
  const targetDb = path.join(newPath, 'second_brain.db');
  if (!fs.existsSync(targetDb) && fs.existsSync(oldPath)) {
    for (const itemName of fs.readdirSync(oldPath)) {
      const source = path.join(oldPath, itemName);
      const target = path.join(newPath, itemName);
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
      fs.renameSync(source, target);
    }
  }

  fs.writeFileSync(path.join(APP_ROOT, 'data_config.json'), JSON.stringify({ data_path: newPath }, null, 4), 'utf8');
  return { status: 'ok', message: 'Data path switched. Restart the app to apply it.' };
}

function importData(payload) {
  const input = ensurePlainObject(payload);
  if (typeof input.source_path !== 'string' || !input.source_path.trim()) {
    throw new Error('source_path is required');
  }

  const sourcePath = path.resolve(input.source_path);
  const dataRoot = path.resolve(DATA_ROOT);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error('Invalid source path');
  }
  if (sourcePath === dataRoot) {
    throw new Error('Source path is the current data path');
  }
  if (!fs.existsSync(path.join(sourcePath, 'second_brain.db')) || !fs.existsSync(path.join(sourcePath, 'vault'))) {
    throw new Error('Source path must contain second_brain.db and vault');
  }

  const backupRoot = path.join(dataRoot, 'backups', `import-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  for (const itemName of ['vault', 'second_brain.db', 'chroma_store']) {
    const current = path.join(dataRoot, itemName);
    if (fs.existsSync(current)) {
      copyPath(current, path.join(backupRoot, itemName));
    }
  }

  for (const itemName of ['vault', 'second_brain.db', 'chroma_store']) {
    const source = path.join(sourcePath, itemName);
    if (fs.existsSync(source)) {
      replacePath(source, path.join(dataRoot, itemName));
    }
  }
  return { status: 'ok', message: 'Data imported. Restart the app to apply it.', backup_path: backupRoot };
}

async function updateSystem(payload = {}) {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const force = input.force === true;
  const gitCmd = resolveGitCommand();
  if (!gitCmd) {
    return { status: 'error', output: 'Git command not found' };
  }

  const cwd = repoRoot();
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    return { status: 'error', output: `.git directory not found at ${cwd}` };
  }

  const branchResult = await runProcess(gitCmd, ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  let branch = branchResult.stdout.trim();
  if (!branch || branch === 'HEAD') {
    branch = (process.env.NOVA_RELEASE_CHANNEL || 'main').trim() || 'main';
  }

  const fetchResult = await runProcess(gitCmd, ['fetch', 'origin', branch], { cwd });
  if (fetchResult.code !== 0) {
    return { status: 'error', output: fetchResult.stderr || fetchResult.stdout };
  }

  const localResult = await runProcess(gitCmd, ['rev-parse', 'HEAD'], { cwd });
  const remoteResult = await runProcess(gitCmd, ['rev-parse', `origin/${branch}`], { cwd });
  const local = localResult.stdout.trim();
  const remote = remoteResult.stdout.trim();
  if (!local || !remote) {
    return { status: 'error', output: `Could not resolve local or remote revision for ${branch}` };
  }
  if (local === remote && !force) {
    return { status: 'up-to-date', output: `Already up to date at ${local.slice(0, 7)}` };
  }
  if (!force) {
    return { status: 'pending', output: `Update available: ${local.slice(0, 7)} -> ${remote.slice(0, 7)}` };
  }

  const pullResult = await runProcess(gitCmd, ['pull', 'origin', branch], { cwd });
  return {
    status: pullResult.code === 0 ? 'ok' : 'error',
    output: `${pullResult.stdout}\n${pullResult.stderr}`,
  };
}

function restartSystem() {
  const batPath = path.join(repoRoot(), 'fast_update.bat');
  if (!fs.existsSync(batPath)) {
    throw new Error(`fast_update.bat not found at ${batPath}`);
  }

  if (process.platform === 'win32') {
    const creationflags = process.platform === 'win32' ? 0x00000010 : 0;
    spawn('cmd.exe', ['/c', batPath], { cwd: repoRoot(), detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], creationflags }).unref();
  } else {
    spawn(batPath, [], { cwd: repoRoot(), detached: true, stdio: ['ignore', 'ignore', 'ignore'] }).unref();
  }
  return { status: 'ok', message: 'Restarting...' };
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
  // v0.23.4: support parameterized paths via `pathPattern` (RegExp). When
  // present, validate input.path against the pattern; otherwise enforce the
  // literal path equality used by static endpoints.
  let resolvedPath;
  if (allowed.pathPattern instanceof RegExp) {
    if (typeof input.path !== 'string' || !allowed.pathPattern.test(input.path)) {
      throw new Error(`Desktop API path not allowed for ${input.channel}`);
    }
    resolvedPath = input.path;
  } else {
    if (input.path !== allowed.path) {
      throw new Error(`Desktop API path not allowed for ${input.channel}`);
    }
    resolvedPath = allowed.path;
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
    path: resolvedPath,
    body: options.body,
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || APP_ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env || process.env,
    });

    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

function copyPath(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true });
  } else {
    fs.copyFileSync(source, target);
  }
}

function replacePath(source, target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  copyPath(source, target);
}

function repoRoot() {
  return APP_ROOT;
}

function resolveGitCommand() {
  const candidates = [
    'git',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe') : null,
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'git' || fs.existsSync(candidate)) || null;
}

function requestBackendApi(payload) {
  const request = normalizeDesktopApiRequest(payload);
  const targetUrl = new URL(`${BACKEND_API_BASE}${request.path}`);
  const transport = targetUrl.protocol === 'https:' ? https : http;
  const body = request.body;
  const timeoutMs = Number.isFinite(payload && payload.timeoutMs) ? payload.timeoutMs : 15_000;
  const headers = {
    'x-nova-desktop-token': DESKTOP_LOCAL_TOKEN,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const req = transport.request(targetUrl, {
      method: request.method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          settled = true;
          reject(new Error(text || `Backend request failed with ${res.statusCode}`));
          return;
        }
        if (!text) {
          settled = true;
          resolve(null);
          return;
        }
        try {
          settled = true;
          resolve(JSON.parse(text));
        } catch {
          settled = true;
          resolve(text);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      const timeoutError = new Error(`Backend request timed out after ${timeoutMs}ms: ${request.method} ${request.path}`);
      req.destroy(timeoutError);
      reject(timeoutError);
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

function loadRevisionSnapshotQueue() {
  try {
    if (!fs.existsSync(REVISION_SNAPSHOT_QUEUE_PATH)) {
      return;
    }
    const raw = fs.readFileSync(REVISION_SNAPSHOT_QUEUE_PATH, 'utf8');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) {
      return;
    }
    revisionSnapshotQueue.splice(0, revisionSnapshotQueue.length, ...rows.filter((item) => (
      item &&
      Number.isInteger(item.noteId) &&
      typeof item.content === 'string'
    )));
  } catch (error) {
    console.warn('[revision] failed to load snapshot queue:', error && error.message ? error.message : error);
    try {
      const corruptPath = path.join(
        path.dirname(REVISION_SNAPSHOT_QUEUE_PATH),
        `revision-snapshot-queue.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );
      fs.renameSync(REVISION_SNAPSHOT_QUEUE_PATH, corruptPath);
      console.warn('[revision] corrupt snapshot queue moved to:', corruptPath);
    } catch (moveError) {
      console.warn('[revision] failed to quarantine corrupt snapshot queue:', moveError && moveError.message ? moveError.message : moveError);
    }
    revisionSnapshotQueue.splice(0, revisionSnapshotQueue.length);
  }
}

function persistRevisionSnapshotQueue() {
  try {
    const queueDir = path.dirname(REVISION_SNAPSHOT_QUEUE_PATH);
    fs.mkdirSync(queueDir, { recursive: true });
    const tmpPath = `${REVISION_SNAPSHOT_QUEUE_PATH}.tmp-${process.pid}`;
    const backupPath = `${REVISION_SNAPSHOT_QUEUE_PATH}.bak`;
    fs.writeFileSync(tmpPath, JSON.stringify(revisionSnapshotQueue.slice(-300), null, 2), 'utf8');
    try {
      fs.rmSync(backupPath, { force: true });
    } catch {}
    if (fs.existsSync(REVISION_SNAPSHOT_QUEUE_PATH)) {
      fs.renameSync(REVISION_SNAPSHOT_QUEUE_PATH, backupPath);
    }
    fs.renameSync(tmpPath, REVISION_SNAPSHOT_QUEUE_PATH);
    try {
      fs.rmSync(backupPath, { force: true });
    } catch {}
  } catch (error) {
    console.warn('[revision] failed to persist snapshot queue:', error && error.message ? error.message : error);
  }
}

function setRevisionSnapshotStatus(noteId, status, detail = '') {
  if (!Number.isInteger(noteId)) {
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('revision:snapshot-status', {
      noteId,
      status,
      detail,
      queued: revisionSnapshotQueue.filter((item) => item.noteId === noteId).length,
      updatedAt: new Date().toISOString(),
    });
  }
}

function scheduleRevisionSnapshotQueueDrain(delayMs = 500) {
  if (revisionSnapshotDrainTimer) {
    clearTimeout(revisionSnapshotDrainTimer);
  }
  revisionSnapshotDrainTimer = setTimeout(() => {
    revisionSnapshotDrainTimer = null;
    void drainRevisionSnapshotQueue();
  }, delayMs);
}

function isPermanentRevisionSnapshotError(error) {
  const message = error && error.message ? error.message : String(error || '');
  return (
    message.includes('Note not found') ||
    message.includes('FOREIGN KEY constraint failed') ||
    message.includes('"status":"skipped"')
  );
}

function enqueueRevisionSnapshot({ noteId, title = '', content = '', source = 'auto' }) {
  if (!Number.isInteger(noteId) || typeof content !== 'string') {
    return;
  }
  const contentHash = crypto.createHash('sha1').update(`${title}\n${content}`).digest('hex');
  if (revisionSnapshotQueue.some((item) => item.noteId === noteId && item.contentHash === contentHash && item.source === source)) {
    return;
  }
  if (source === 'stable') {
    for (let index = revisionSnapshotQueue.length - 1; index >= 0; index -= 1) {
      const queued = revisionSnapshotQueue[index];
      if (queued.noteId === noteId && queued.source === 'stable') {
        revisionSnapshotQueue.splice(index, 1);
      }
    }
  }
  revisionSnapshotQueue.push({
    id: crypto.randomUUID(),
    noteId,
    title: title || '',
    content,
    source,
    contentHash,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  persistRevisionSnapshotQueue();
  setRevisionSnapshotStatus(noteId, 'queued');
  scheduleRevisionSnapshotQueueDrain();
}

async function drainRevisionSnapshotQueue() {
  if (revisionSnapshotDrainPromise) {
    return revisionSnapshotDrainPromise;
  }

  revisionSnapshotDrainPromise = (async () => {
    while (revisionSnapshotQueue.length > 0) {
      const item = revisionSnapshotQueue[0];
      try {
        setRevisionSnapshotStatus(item.noteId, 'saving');
        const result = await requestBackendApi({
          channel: 'notes:snapshot',
          path: '/notes/' + item.noteId + '/snapshot',
          timeoutMs: 2_000,
          options: {
            method: 'POST',
            body: JSON.stringify({
              source: item.source,
              title: item.title,
              content: item.content,
            }),
          },
        });
        if (result && result.status === 'error') {
          throw new Error(result.detail || 'snapshot API returned error');
        }
        revisionSnapshotQueue.shift();
        persistRevisionSnapshotQueue();
        setRevisionSnapshotStatus(item.noteId, 'saved');
      } catch (error) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = error && error.message ? error.message : String(error);
        item.lastAttemptAt = new Date().toISOString();
        if (isPermanentRevisionSnapshotError(error) || item.attempts >= MAX_REVISION_SNAPSHOT_ATTEMPTS) {
          revisionSnapshotQueue.shift();
          persistRevisionSnapshotQueue();
          setRevisionSnapshotStatus(item.noteId, 'saved');
          continue;
        }
        persistRevisionSnapshotQueue();
        setRevisionSnapshotStatus(item.noteId, 'failed', item.lastError);
        scheduleRevisionSnapshotQueueDrain(Math.min(60_000, 5_000 * item.attempts));
        break;
      }
    }
  })().finally(() => {
    revisionSnapshotDrainPromise = null;
  });

  return revisionSnapshotDrainPromise;
}

async function captureRevisionSnapshotBeforeLocalUpdate(noteId, input) {
  if (!Object.prototype.hasOwnProperty.call(input, 'content')) {
    return;
  }

  try {
    const current = await fsBridge.getNote(noteId);
    if (!current || (current.content || '') === (input.content || '')) {
      return;
    }
    enqueueRevisionSnapshot({
      noteId,
      title: current.title || '',
      content: current.content || '',
      source: 'pre-save',
    });
  } catch (error) {
    console.warn('[revision] failed to queue desktop snapshot for note ' + noteId + ':', error && error.message ? error.message : error);
  }
}

function scheduleRevisionSnapshotAfterLocalUpdate(noteId, note) {
  const existing = revisionSnapshotTimers.get(noteId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    revisionSnapshotTimers.delete(noteId);
    enqueueRevisionSnapshot({
      noteId,
      title: note?.title || '',
      content: note?.content || '',
      source: 'stable',
    });
  }, REVISION_FINAL_SNAPSHOT_DELAY_MS);

  revisionSnapshotTimers.set(noteId, { timer, note });
}

function captureStableRevisionSnapshot(noteId) {
  const pending = revisionSnapshotTimers.get(noteId);
  enqueueRevisionSnapshot({
    noteId,
    title: pending?.note?.title || '',
    content: pending?.note?.content || '',
    source: 'stable',
  });
  return drainRevisionSnapshotQueue();
}

async function flushPendingRevisionSnapshotTimers() {
  for (const [noteId, entry] of revisionSnapshotTimers.entries()) {
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    enqueueRevisionSnapshot({
      noteId,
      title: entry?.note?.title || '',
      content: entry?.note?.content || '',
      source: 'stable',
    });
  }
  revisionSnapshotTimers.clear();
  persistRevisionSnapshotQueue();
  void drainRevisionSnapshotQueue();
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
  trustedIpcHandle('desktop:api-request', async (_event, payload) => requestBackendApi(payload));
  trustedIpcHandle('desktop:get-backend-base-url', async () => BACKEND_API_BASE);
  trustedIpcHandle('desktop:window-control', async (event, payload = {}) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return { ok: false, reason: 'window-not-found' };

    switch (payload.action) {
      case 'minimize':
        targetWindow.minimize();
        return { ok: true };
      case 'maximize':
        if (targetWindow.isMaximized()) targetWindow.unmaximize();
        else targetWindow.maximize();
        return { ok: true };
      case 'close':
        targetWindow.close();
        return { ok: true };
      default:
        return { ok: false, reason: 'unsupported-action' };
    }
  });
  trustedIpcHandle('system:open-file', async (_event, payload) => openLocalFile(payload));
  trustedIpcHandle('system:switch-data-path', async (_event, payload) => switchDataPath(payload));
  trustedIpcHandle('system:import-data', async (_event, payload) => importData(payload));
  trustedIpcHandle('system:update', async (_event, payload) => updateSystem(payload));
  trustedIpcHandle('system:restart', async () => restartSystem());
  trustedIpcHandle('ai:update-ollama', async () => runUpdateOllama());

  // v0.23.0 · 离线更新与版本管理 IPC
  // ---------------------------------------------------------------
  // updaterBridge 把调用转发给 python -m backend.services.updater_cli,
  // 这样 UpdaterService 的所有校验/落盘/切换逻辑只存在一处.
  try {
    const { command, args } = resolveBackendLauncher();
    // Prefer the resolved Python executable; fall back to 'python' so CI/dev can run it.
    const pythonExe = (() => {
      if (Array.isArray(args) && args.length > 0 && command.endsWith('python')) {
        return command;
      }
      if (command && /python(\.exe)?$/i.test(command)) return command;
      return process.env.NOVA_BACKEND_PYTHON || 'python';
    })();
    registerUpdaterIpc(ipcMain, { appRoot: APP_ROOT, pythonExe, dialog });
  } catch (error) {
    console.warn(`[updater] failed to register IPC: ${error.message}`);
  }

  trustedIpcHandle('notes:list', async (_event, payload = {}) => {
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    return fsBridge.listNotes({ includeContent: input.includeContent === true });
  });
  trustedIpcHandle('notes:get', async (_event, payload) => {
    const input = ensurePlainObject(payload);
    return fsBridge.getNote(ensureInteger(input.id, 'id'));
  });
  trustedIpcHandle('notes:changed', async (_event, payload = {}) => {
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    return fsBridge.getNotesByPaths(input.filenames, { includeContent: input.includeContent !== false });
  });
  trustedIpcHandle('notes:create', async (_event, payload) => {
    const input = pickNoteWritePayload(payload);
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new Error('title is required');
    }
    const created = await fsBridge.createNote(input);
    markLocalVaultChange(created.file_path);
    return created;
  });
  trustedIpcHandle('folders:create', async (_event, payload) => {
    const input = ensurePlainObject(payload);
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new Error('title is required');
    }
    const created = await fsBridge.createFolder(input);
    markLocalVaultChange(created.file_path);
    return created;
  });
  trustedIpcHandle('notes:update', async (_event, payload) => {
    const input = pickNoteWritePayload(payload);
    const noteId = ensureInteger(input.id, 'id');
    if (typeof input.file_path === 'string') {
      markLocalVaultChange(input.file_path);
    }
    void captureRevisionSnapshotBeforeLocalUpdate(noteId, input);
    const updated = await fsBridge.updateNote(noteId, input);
    markLocalVaultChange(updated.file_path);
    if (Object.prototype.hasOwnProperty.call(input, 'content')) {
      scheduleRevisionSnapshotAfterLocalUpdate(noteId, updated);
    }
    return updated;
  });
  trustedIpcHandle('notes:delete', async (_event, payload) => {
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

app.whenReady().then(async () => {
  try {
    await bootstrapApp();
    // M5 — startup health self-check: mark current version healthy after a
    // successful bootstrap. We swallow errors here because failing the
    // bookkeeping must not block a working app.
    try {
      await runUpdaterCli('mark_healthy', { version: resolveCurrentVersionFromMain() }).catch(() => {});
    } catch (_) {}
  } catch (error) {
    console.error('[main] failed to bootstrap application', error);
    // M5 · two-crash breaker: record the crash and try auto-rollback before bailing
    try {
      const ver = resolveCurrentVersionFromMain();
      if (ver) {
        await runUpdaterCli('mark_failed', { version: ver, reason: String(error?.message || error) }).catch(() => {});
        const rb = await runUpdaterCli('auto_rollback_if_needed', {}).catch(() => null);
        if (rb && rb.rolled_back) {
          console.warn('[main] auto-rolled back', rb);
          // Tell the user we rolled back; on next launch the previous version runs
          dialog.showErrorBox(
            'Nova auto-rolled back',
            `Version ${rb.from_version} crashed twice; rolled back to ${rb.to_version}. Restart the app.`
          );
          app.quit();
          return;
        }
      }
    } catch (cleanupErr) {
      console.error('[main] auto-rollback bookkeeping failed', cleanupErr);
    }
    dialog.showErrorBox('Nova startup failed', error?.message || String(error));
    app.quit();
  }
});

function resolveCurrentVersionFromMain() {
  try {
    const slot = resolveCurrentSlot(APP_ROOT);
    if (!slot) return null;
    const v = require('node:fs').readFileSync(require('node:path').join(slot, 'VERSION.txt'), 'utf8').trim();
    return v || null;
  } catch (_) {
    return null;
  }
}

function runUpdaterCli(action, args) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('node:child_process');
    const pythonExe = process.env.NOVA_BACKEND_PYTHON || 'python';
    const child = spawn(pythonExe, ['-m', 'backend.services.updater_cli', '--app-root', APP_ROOT], {
      cwd: resolveCurrentSlot(APP_ROOT) || APP_ROOT,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => { out += b.toString('utf8'); });
    child.stderr.on('data', (b) => { err += b.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`updater_cli exited ${code}: ${err}`));
      try { resolve(out.trim() ? JSON.parse(out) : null); }
      catch (e) { reject(new Error(`bad JSON from updater_cli: ${out}`)); }
    });
    child.stdin.end(JSON.stringify({ action, args: args || {} }), 'utf8');
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
  flushPendingRevisionSnapshotTimers();
  persistRevisionSnapshotQueue();
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
