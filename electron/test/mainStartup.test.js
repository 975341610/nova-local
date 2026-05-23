const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('main process handles backend startup failures explicitly', () => {
  assert.match(mainSource, /app\.whenReady\(\)\.then\(async \(\) =>/);
  assert.match(mainSource, /try\s*{\s*await bootstrapApp\(\)/);
  assert.match(mainSource, /catch \(error\)/);
  assert.match(mainSource, /async function bootstrapApp\(\)/);
});

test('startup failure records failed version and attempts auto rollback', () => {
  assert.match(mainSource, /runUpdaterCli\('mark_failed'/);
  assert.match(mainSource, /runUpdaterCli\('auto_rollback_if_needed'/);
  assert.match(mainSource, /auto-rolled back/);
  assert.match(mainSource, /Version \$\{rb\.from_version\} crashed twice; rolled back to \$\{rb\.to_version\}/);
});

test('backend child process output is piped for diagnostics', () => {
  assert.doesNotMatch(mainSource, /stdio:\s*'ignore'/);
  assert.match(mainSource, /backendProcess\.stderr\.on\('data'/);
  assert.match(mainSource, /backendProcess\.stdout\.on\('data'/);
});

test('backend launcher is resolved instead of hard-coded to Windows venv path', () => {
  assert.match(mainSource, /function resolveBackendLauncher/);
  assert.doesNotMatch(mainSource, /spawn\(VENV_PYTHON/);
  assert.match(mainSource, /NOVA_BACKEND_PYTHON/);
  assert.match(mainSource, /process\.platform/);
});

test('main process derives vault and log paths from runtime data config', () => {
  assert.match(mainSource, /function resolveDataRoot/);
  assert.match(mainSource, /data_config\.json/);
  assert.match(mainSource, /const DATA_ROOT = resolveDataRoot\(\)/);
  assert.match(mainSource, /const VAULT_ROOT = path\.join\(DATA_ROOT, 'vault'\)/);
  assert.doesNotMatch(mainSource, /const VAULT_ROOT = path\.join\(APP_ROOT, 'data', 'vault'\)/);
  assert.doesNotMatch(mainSource, /const logsDir = path\.join\(APP_ROOT, 'data', 'logs'\)/);
});

test('renderer sandbox is enabled by default', () => {
  assert.match(mainSource, /sandbox:\s*true/);
  assert.doesNotMatch(mainSource, /sandbox:\s*false/);
});

test('main IPC handlers verify the renderer sender before privileged work', () => {
  assert.match(mainSource, /function requireTrustedIpcSender/);
  assert.match(mainSource, /function trustedIpcHandle/);
  assert.match(mainSource, /trustedIpcHandle\('system:switch-data-path'/);
  assert.doesNotMatch(mainSource, /ipcMain\.handle\('system:switch-data-path'/);
  assert.match(mainSource, /trustedIpcHandle\('desktop:api-request'/);
});
