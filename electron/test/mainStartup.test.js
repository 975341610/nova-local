const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('main process handles backend startup failures explicitly', () => {
  assert.match(mainSource, /app\.whenReady\(\)\.then\(bootstrapApp\)\.catch/);
  assert.match(mainSource, /async function bootstrapApp\(\)/);
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
