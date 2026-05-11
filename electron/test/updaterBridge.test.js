/**
 * Unit tests for electron/updaterBridge.js (M3 red phase).
 *
 * Scope: Node-side, no Electron app context. Tests exercise the pure
 * primitives — atomic switch, bootstrap migration, resolveCurrentSlot —
 * on a real temporary filesystem.
 *
 * IPC handler registration is smoke-tested against the source file; the
 * actual runtime IPC loop belongs in Electron itself.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SRC = path.join(__dirname, '..', 'updaterBridge.js');

function mkAppRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-m3-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  return root;
}

function rmrf(p) {
  if (!fs.existsSync(p) && !fs.lstatSync(p, { throwIfNoEntry: false })) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function writeFileEnsured(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---------------------------------------------------------------------------
// 1. Source-level invariants
// ---------------------------------------------------------------------------

test('updaterBridge source exports the required primitives', () => {
  assert.ok(fs.existsSync(SRC), 'updaterBridge.js should exist');
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /module\.exports\s*=/);
  assert.match(src, /resolveCurrentSlot/);
  assert.match(src, /atomicSwitchCurrent/);
  assert.match(src, /bootstrapVersionedLayout/);
  assert.match(src, /resolveFeedPackageUrl/);
  assert.match(src, /assertDownloadedPackage/);
  assert.match(src, /registerIpc/);
});

test('updaterBridge uses directory junction on Windows', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  // POSIX path uses symlink(target, link, 'dir'), Windows uses 'junction'
  assert.match(src, /process\.platform\s*===\s*['"]win32['"]/);
  assert.match(src, /['"]junction['"]/);
});

// ---------------------------------------------------------------------------
// 2. atomicSwitchCurrent
// ---------------------------------------------------------------------------

test('atomicSwitchCurrent creates current link to target slot', () => {
  const { atomicSwitchCurrent, resolveCurrentSlot } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    const slot = path.join(root, 'versions', '0.23.0');
    writeFileEnsured(path.join(slot, 'VERSION.txt'), '0.23.0\n');

    atomicSwitchCurrent(root, slot);

    const currentLink = path.join(root, 'current');
    assert.ok(fs.existsSync(currentLink));
    const resolved = resolveCurrentSlot(root);
    assert.equal(resolved, slot);
    assert.equal(
      fs.readFileSync(path.join(currentLink, 'VERSION.txt'), 'utf8').trim(),
      '0.23.0'
    );
  } finally {
    rmrf(root);
  }
});

test('atomicSwitchCurrent re-points to a different slot without losing data', () => {
  const { atomicSwitchCurrent } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    const slotA = path.join(root, 'versions', '0.22.0');
    const slotB = path.join(root, 'versions', '0.23.0');
    writeFileEnsured(path.join(slotA, 'VERSION.txt'), '0.22.0\n');
    writeFileEnsured(path.join(slotB, 'VERSION.txt'), '0.23.0\n');

    atomicSwitchCurrent(root, slotA);
    atomicSwitchCurrent(root, slotB);

    assert.equal(
      fs.readFileSync(path.join(root, 'current', 'VERSION.txt'), 'utf8').trim(),
      '0.23.0'
    );
    // Original slot content intact
    assert.equal(
      fs.readFileSync(path.join(slotA, 'VERSION.txt'), 'utf8').trim(),
      '0.22.0'
    );
  } finally {
    rmrf(root);
  }
});

test('atomicSwitchCurrent never touches app_root/data/', () => {
  const { atomicSwitchCurrent } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    const vault = path.join(root, 'data', 'vault', 'Notes');
    fs.mkdirSync(vault, { recursive: true });
    fs.writeFileSync(path.join(vault, 'private.md'), 'keep me safe');
    const slot = path.join(root, 'versions', '0.23.0');
    writeFileEnsured(path.join(slot, 'VERSION.txt'), '0.23.0\n');

    atomicSwitchCurrent(root, slot);

    assert.equal(
      fs.readFileSync(path.join(vault, 'private.md'), 'utf8'),
      'keep me safe'
    );
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 3. resolveCurrentSlot
// ---------------------------------------------------------------------------

test('resolveCurrentSlot returns null when current link absent', () => {
  const { resolveCurrentSlot } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    assert.equal(resolveCurrentSlot(root), null);
  } finally {
    rmrf(root);
  }
});

test('resolveCurrentSlot returns the resolved target directory', () => {
  const { atomicSwitchCurrent, resolveCurrentSlot } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    const slot = path.join(root, 'versions', '0.23.0');
    writeFileEnsured(path.join(slot, 'VERSION.txt'), '0.23.0\n');
    atomicSwitchCurrent(root, slot);
    assert.equal(resolveCurrentSlot(root), slot);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 4. bootstrapVersionedLayout — migrate legacy flat layout
// ---------------------------------------------------------------------------

test('bootstrap migrates a legacy flat layout into versions/<ver>/', () => {
  const { bootstrapVersionedLayout, resolveCurrentSlot } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    // simulate v0.22.0 flat layout
    writeFileEnsured(path.join(root, 'VERSION.txt'), '0.22.0\n');
    writeFileEnsured(path.join(root, 'backend', 'main.py'), '# py');
    writeFileEnsured(path.join(root, 'electron', 'main.js'), '// js');
    writeFileEnsured(path.join(root, 'frontend_dist', 'index.html'), '<html>');
    writeFileEnsured(path.join(root, 'data', 'vault', 'note.md'), 'hi');

    const result = bootstrapVersionedLayout(root);

    assert.equal(result.migrated, true);
    assert.equal(result.version, '0.22.0');

    const slot = path.join(root, 'versions', '0.22.0');
    assert.ok(fs.existsSync(path.join(slot, 'backend', 'main.py')));
    assert.ok(fs.existsSync(path.join(slot, 'electron', 'main.js')));
    assert.ok(fs.existsSync(path.join(slot, 'frontend_dist', 'index.html')));
    assert.equal(
      fs.readFileSync(path.join(slot, 'VERSION.txt'), 'utf8').trim(),
      '0.22.0'
    );
    // current points at the new slot
    assert.equal(resolveCurrentSlot(root), slot);
    // data/ untouched
    assert.equal(
      fs.readFileSync(path.join(root, 'data', 'vault', 'note.md'), 'utf8'),
      'hi'
    );
    // legacy flat dirs removed
    assert.equal(fs.existsSync(path.join(root, 'backend', 'main.py')), false);
    assert.equal(fs.existsSync(path.join(root, 'electron', 'main.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'frontend_dist', 'index.html')), false);
  } finally {
    rmrf(root);
  }
});

test('bootstrap is a no-op when already version-slotted', () => {
  const { bootstrapVersionedLayout } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    const slot = path.join(root, 'versions', '0.23.0');
    writeFileEnsured(path.join(slot, 'VERSION.txt'), '0.23.0\n');
    // simulate current already pointed somewhere
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(slot, path.join(root, 'current'), linkType);

    const result = bootstrapVersionedLayout(root);

    assert.equal(result.migrated, false);
    assert.equal(result.version, '0.23.0');
  } finally {
    rmrf(root);
  }
});

test('bootstrap refuses to migrate when VERSION.txt is missing', () => {
  const { bootstrapVersionedLayout } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    writeFileEnsured(path.join(root, 'backend', 'main.py'), '# py');
    // No VERSION.txt, no versions/ dir -> ambiguous, should bail loudly
    assert.throws(() => bootstrapVersionedLayout(root), /VERSION\.txt/i);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 5. IPC surface invariants (static check — real runtime needs Electron)
// ---------------------------------------------------------------------------

test('updaterBridge registers the documented IPC channels', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const expected = [
    'updater:verify',
    'updater:import',
    'updater:install',
    'updater:list-versions',
    'updater:switch-to',
    'updater:get-rollback-target',
    'updater:get-current-version',
  ];
  for (const ch of expected) {
    assert.match(src, new RegExp(ch), `missing IPC channel: ${ch}`);
  }
  assert.match(src, /updater-install-failures\.log/);
});

test('resolveFeedPackageUrl resolves package files relative to latest feed url', () => {
  const { resolveFeedPackageUrl } = require('..' + '/updaterBridge.js');

  assert.equal(
    resolveFeedPackageUrl(
      'https://updates.example.com/nova/latest.json',
      'nova-v0.24.0-full.nova-update'
    ),
    'https://updates.example.com/nova/nova-v0.24.0-full.nova-update'
  );
  assert.equal(
    resolveFeedPackageUrl(
      'https://updates.example.com/nova/latest.json',
      'https://cdn.example.com/nova-v0.24.0-full.nova-update'
    ),
    'https://cdn.example.com/nova-v0.24.0-full.nova-update'
  );
});

test('assertDownloadedPackage validates downloaded package size and sha256', () => {
  const { assertDownloadedPackage } = require('..' + '/updaterBridge.js');
  const root = mkAppRoot();
  try {
    const file = path.join(root, 'pkg.nova-update');
    fs.writeFileSync(file, 'nova package bytes');

    assert.doesNotThrow(() =>
      assertDownloadedPackage(file, {
        size: 18,
        sha256: '9483df31317949bef5ec3f96a972e892003a3209d4ab34f341f3c519ad61e683',
      })
    );
    assert.throws(
      () => assertDownloadedPackage(file, { size: 17 }),
      /size mismatch/i
    );
    assert.throws(
      () => assertDownloadedPackage(file, { sha256: '00' }),
      /sha256 mismatch/i
    );
  } finally {
    rmrf(root);
  }
});
