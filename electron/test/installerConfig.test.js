const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const mainSource = fs.readFileSync(path.join(repoRoot, 'electron', 'main.js'), 'utf8');

test('main window uses the packaged QingZhi app icon', () => {
  assert.match(mainSource, /APP_ICON/);
  assert.match(mainSource, /icon:\s*APP_ICON/);
  assert.ok(fs.existsSync(path.join(repoRoot, 'build', 'app-icon.ico')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'build', 'app-icon.png')));
});

test('Windows installer config builds a branded NSIS exe', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['package:win'], 'electron-builder --win nsis');
  assert.equal(packageJson.devDependencies['electron-builder'], '^26.0.12');
  assert.equal(packageJson.build.appId, 'com.qingzhi.notes');
  assert.equal(packageJson.build.productName, '清知');
  assert.equal(packageJson.build.directories.app, 'dist/installer-app');
  assert.equal(packageJson.build.win.icon, 'build/app-icon.ico');
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
});
