/**
 * electron/updaterBridge.js — M3
 *
 * Responsibility:
 *   1. Resolve APP_ROOT/current to the versioned slot actually running.
 *   2. Atomically repoint `current` across versions (POSIX symlink / Windows junction).
 *   3. Bootstrap a legacy flat v0.22.x install into the versioned layout on first run.
 *   4. Expose IPC handlers the UpdaterPanel (M4) and Python UpdaterService
 *      will converse with from the renderer / main process.
 *
 * Design constraints:
 *   - app_root/data/ is sacred. Nothing in this module ever writes to it.
 *   - All writes restricted to:
 *       app_root/versions/**, app_root/current, app_root/rollback_pointer.json,
 *       app_root/cache/updates/**
 *   - "Atomic" = use a side-by-side temp name + rename. Half-written states are
 *     impossible because rename replaces the entry in one FS op.
 *   - Windows: directory junctions (fs.symlinkSync(..., 'junction')) — these
 *     do NOT require Administrator, unlike symbolic links.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const { spawn } = require('node:child_process');

const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

// ---------------------------------------------------------------------------
// Resolve helpers
// ---------------------------------------------------------------------------

/**
 * Return the absolute path of the slot `current` points to, or null if current
 * does not exist / is broken.
 */
function resolveCurrentSlot(appRoot) {
  const link = path.join(appRoot, 'current');
  let st;
  try {
    st = fs.lstatSync(link);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    const real = fs.realpathSync(link);
    // If resolution worked and the target exists, return it
    return real;
  } catch (e) {
    if (e.code === 'ENOENT') return null; // broken link
    throw e;
  }
}

function readVersionTxt(slotDir) {
  try {
    return fs
      .readFileSync(path.join(slotDir, 'VERSION.txt'), 'utf8')
      .trim();
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function resolveCurrentVersion(appRoot) {
  const slot = resolveCurrentSlot(appRoot);
  if (slot) {
    const v = readVersionTxt(slot);
    if (v) return v;
    // v0.23.3 fallback #1: some installs shipped the slot without VERSION.txt
    // (e.g., manual xcopy during a rescue). In versioned layout the slot's
    // own directory name IS the version number (versions/<X.Y.Z>/), so we
    // can infer it from basename without reading any file. Accept anything
    // shaped like a semver (three dotted numeric segments, optional pre).
    const base = path.basename(slot);
    if (/^\d+\.\d+\.\d+([.\-+].*)?$/.test(base)) return base;
  }
  // Flat layout fallback: some installs run without a `current\` junction
  // (e.g. the user manually removed it to break an earlier nesting bug, or
  // the legacy v0.22.x layout where VERSION.txt + backend/ live directly at
  // APP_ROOT). In those cases the running version is simply appRoot's own
  // VERSION.txt. Without this fallback, the Settings → Updates panel shows
  // "当前版本 —" even though Nova is clearly running.
  const flatVersion = readVersionTxt(appRoot);
  if (flatVersion) return flatVersion;

  // v0.23.4 fallback #3: when bootstrap was interrupted in a half-broken state
  // (slot exists under versions/<X>/ but lacks VERSION.txt, AND appRoot has no
  // VERSION.txt either, AND `current\` was never created or pointed elsewhere)
  // — the only remaining authoritative record is versions/.index.json, which
  // bootstrapVersionedLayout writes once on first run. Pick the most recently
  // installed healthy non-disabled entry. This stops the Settings panel from
  // showing "当前版本 —" after a manual recovery where the user fixed the slot
  // but forgot to recreate VERSION.txt at the slot root.
  try {
    const idxPath = path.join(appRoot, 'versions', '.index.json');
    const raw = fs.readFileSync(idxPath, 'utf8');
    const idx = JSON.parse(raw);
    const list = Array.isArray(idx && idx.versions) ? idx.versions : [];
    const healthy = list.filter((v) => v && v.healthy && !v.disabled && v.version);
    if (healthy.length > 0) {
      // Index is append-on-install; trust insertion order, last one wins.
      return healthy[healthy.length - 1].version;
    }
  } catch (_) {
    /* missing or malformed .index.json — fall through */
  }

  return null;
}

// ---------------------------------------------------------------------------
// Atomic switch of `current`
// ---------------------------------------------------------------------------

/**
 * Atomically repoint `app_root/current` to `targetSlot`.
 *
 * Strategy:
 *   1. mkdir parent if necessary.
 *   2. Create `current.tmp` symlink pointing at targetSlot.
 *   3. fs.renameSync(current.tmp -> current). Rename is atomic on both NTFS
 *      and POSIX-ish filesystems Nova supports.
 */
function atomicSwitchCurrent(appRoot, targetSlot) {
  if (!fs.existsSync(targetSlot) || !fs.statSync(targetSlot).isDirectory()) {
    throw new Error(`target slot is not a directory: ${targetSlot}`);
  }

  const link = path.join(appRoot, 'current');
  const tmp = path.join(appRoot, 'current.tmp');

  // Clean up any leftover tmp from a previous crash
  if (fs.existsSync(tmp) || lstatIfExists(tmp)) {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }

  fs.symlinkSync(targetSlot, tmp, LINK_TYPE);

  // Ensure `current` exists and is a link/dir we can replace.
  // On POSIX, rename replaces an existing symlink/file atomically.
  // On Windows, NTFS rename onto an existing directory junction works the
  // same way; onto an existing real directory it fails, so we remove first.
  try {
    fs.renameSync(tmp, link);
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EPERM' || err.code === 'ENOTEMPTY') {
      // `current` is a real directory (legacy flat install). Remove it
      // (carefully — only the top-level entry, not its contents followed).
      removeLinkOrDir(link);
      fs.renameSync(tmp, link);
    } else {
      throw err;
    }
  }
}

function lstatIfExists(p) {
  try {
    return fs.lstatSync(p);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function removeLinkOrDir(p) {
  const st = lstatIfExists(p);
  if (!st) return;
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(p);
    return;
  }
  // real directory — legacy flat layout. Safe only before bootstrap has moved
  // the contents out; we rely on callers to have done that first.
  fs.rmSync(p, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Bootstrap: legacy flat layout -> versions/<X>/ + current symlink
// ---------------------------------------------------------------------------

/**
 * If app_root already has a `current` link, no migration is needed.
 *
 * Otherwise, if app_root contains a root-level VERSION.txt + at least one of
 * backend/ / electron/ / frontend_dist/, we have a legacy flat v0.22.x install.
 * Move those entries into versions/<ver>/ and create `current`.
 *
 * Throws if the situation is ambiguous (e.g. no VERSION.txt found anywhere).
 *
 * Returns { migrated: boolean, version: string }.
 */
function bootstrapVersionedLayout(appRoot) {
  const already = resolveCurrentSlot(appRoot);
  if (already) {
    const v = readVersionTxt(already);
    if (!v) {
      throw new Error(
        `current -> ${already} but VERSION.txt is missing or empty`
      );
    }
    return { migrated: false, version: v };
  }

  // v0.23.2 safeguard: refuse to migrate when appRoot itself sits inside a
  // versions/<ver>/ directory. This typically means main.js resolved __dirname
  // through an NTFS junction (current -> versions\<ver>\electron) and computed
  // APP_ROOT one level too deep. Migrating from there would nest
  // versions/<ver>/versions/<ver>/... and trigger EBUSY rename loops.
  // Caller should set NOVA_APP_ROOT explicitly to break the cycle.
  const parentDirName = path.basename(path.dirname(appRoot));
  if (parentDirName === 'versions') {
    throw new Error(
      `refuse to bootstrap: appRoot=${appRoot} is itself a version slot. ` +
        `Set NOVA_APP_ROOT to the real install root (the directory that ` +
        `contains versions/, current/, data/).`
    );
  }

  const flatVersion = readVersionTxt(appRoot);
  if (!flatVersion) {
    throw new Error(
      'cannot bootstrap: no VERSION.txt at app root and no current -> versions/<X>/'
    );
  }

  const slot = path.join(appRoot, 'versions', flatVersion);
  fs.mkdirSync(slot, { recursive: true });

  // Entries we migrate. `data/` is NEVER moved.
  const MIGRATE = ['VERSION.txt', 'backend', 'electron', 'frontend_dist'];
  for (const name of MIGRATE) {
    const src = path.join(appRoot, name);
    const st = lstatIfExists(src);
    if (!st) continue;
    const dst = path.join(slot, name);
    // Remove any pre-existing dst to make rename deterministic.
    if (fs.existsSync(dst) || lstatIfExists(dst)) {
      fs.rmSync(dst, { recursive: true, force: true });
    }
    fs.renameSync(src, dst);
  }

  // Now create `current` pointing at the slot.
  atomicSwitchCurrent(appRoot, slot);

  // Write index.json so Python UpdaterService can see this slot without
  // duplicating bootstrap logic.
  const indexPath = path.join(appRoot, 'versions', '.index.json');
  if (!fs.existsSync(indexPath)) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    fs.writeFileSync(
      indexPath,
      JSON.stringify(
        {
          versions: [
            {
              version: flatVersion,
              installed_at: now,
              healthy: true,
              disabled: false,
              failed_count: 0,
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );
  }

  return { migrated: true, version: flatVersion };
}

// ---------------------------------------------------------------------------
// IPC — talks to Python UpdaterService via a small subprocess RPC
// ---------------------------------------------------------------------------

/**
 * Call the Python backend's updater service as a short-lived subprocess.
 * We deliberately do NOT long-poll — each invocation is a one-shot command
 * so the UI always sees a coherent state.
 *
 * env.NOVA_BACKEND_PYTHON may point to the embedded Python executable.
 */
function callPyUpdater(appRoot, pythonExe, action, args = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ action, args });
    const currentSlot = resolveCurrentSlot(appRoot);
    const cwd = currentSlot || appRoot;
    // PYTHONPATH must explicitly include the directory that contains the
    // `backend/` package. When `current\` junction is absent (flat layout) we
    // point at appRoot; when it's a versioned slot we prefer the slot so the
    // CLI loads the matching `backend/` shipped with that version. Without
    // this, `.venv\Scripts\python.exe -m backend.services.updater_cli` fails
    // with `ModuleNotFoundError: No module named 'backend'` even though cwd
    // is set — Windows + venv does not implicitly add cwd to sys.path.
    const backendRoot = currentSlot || appRoot;
    const existingPyPath = process.env.PYTHONPATH || '';
    const pythonPath = existingPyPath
      ? `${backendRoot}${path.delimiter}${existingPyPath}`
      : backendRoot;

    // v0.23.3+: prefer the start_updater_cli.py shim (mirrors
    // start_backend.py's 3-tier sys.path resolution) so that even if the
    // host process forgot to inject PYTHONPATH, the launcher still finds
    // `backend/`. Fall back to `python -m backend.services.updater_cli`
    // when the shim is missing (legacy installs).
    const shim = path.join(appRoot, 'start_updater_cli.py');
    const useShim = fs.existsSync(shim);
    const spawnArgs = useShim
      ? [shim, '--app-root', appRoot]
      : ['-m', 'backend.services.updater_cli', '--app-root', appRoot];

    const child = spawn(pythonExe, spawnArgs, {
      cwd,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: pythonPath,
      },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => {
      out += b.toString('utf8');
    });
    child.stderr.on('data', (b) => {
      err += b.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`updater_cli exited ${code}: ${err}`));
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`updater_cli produced invalid JSON: ${out}`));
      }
    });
    child.stdin.end(payload, 'utf8');
  });
}

/**
 * Register IPC handlers on a given ipcMain instance.
 * Pulled into its own function so tests can exercise the pure helpers without
 * needing a live Electron app.
 *
 * Channels:
 *   updater:verify                — { path } -> manifest
 *   updater:import                — { path } -> { package_id, manifest }
 *   updater:install               — { package_id } -> install result
 *   updater:list-versions         — {} -> InstalledVersion[]
 *   updater:switch-to             — { version } -> switch result
 *   updater:get-rollback-target   — {} -> string | null
 *   updater:get-current-version   — {} -> string | null
 */
function registerIpc(ipcMain, options) {
  const { appRoot, pythonExe, dialog } = options || {};
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('registerIpc: ipcMain is required');
  }
  if (!appRoot) throw new Error('registerIpc: appRoot is required');

  ipcMain.handle('updater:get-current-version', async () => {
    return resolveCurrentVersion(appRoot);
  });

  ipcMain.handle('updater:verify', async (_evt, { path: p }) => {
    return callPyUpdater(appRoot, pythonExe, 'verify', { path: p });
  });

  ipcMain.handle('updater:import', async (_evt, { path: p }) => {
    return callPyUpdater(appRoot, pythonExe, 'import', { path: p });
  });

  ipcMain.handle('updater:install', async (_evt, { package_id }) => {
    return callPyUpdater(appRoot, pythonExe, 'install', { package_id });
  });

  ipcMain.handle('updater:list-versions', async () => {
    const list = await callPyUpdater(appRoot, pythonExe, 'list_versions', {});
    // v0.23.3: when running in flat layout (no `current\` junction), Python's
    // UpdaterService reads `versions/.index.json` and may not know about the
    // version that's actually running at the root. Inject/flag it here so the
    // UI's "当前版本" row and version-management list stay in sync.
    try {
      const running = resolveCurrentVersion(appRoot);
      if (running && Array.isArray(list)) {
        let found = false;
        for (const row of list) {
          if (row && row.version === running) {
            row.is_current = true;
            found = true;
          } else if (row) {
            row.is_current = false;
          }
        }
        if (!found) {
          const stat = lstatIfExists(path.join(appRoot, 'VERSION.txt'));
          const installedAt = stat && stat.mtime
            ? new Date(stat.mtime).toISOString().replace(/\.\d+Z$/, 'Z')
            : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
          list.unshift({
            version: running,
            installed_at: installedAt,
            is_current: true,
            healthy: true,
            disabled: false,
            failed_count: 0,
          });
        }
      }
    } catch (_) {
      // Best-effort enrichment; never let it break the IPC call.
    }
    return list;
  });

  ipcMain.handle('updater:switch-to', async (_evt, { version }) => {
    const result = await callPyUpdater(appRoot, pythonExe, 'switch_to', {
      version,
    });
    // Electron main MUST respect the new current link immediately
    return result;
  });

  ipcMain.handle('updater:get-rollback-target', async () => {
    return callPyUpdater(appRoot, pythonExe, 'get_rollback_target', {});
  });

  // M5 — health & crash management ----------------------------------------
  ipcMain.handle('updater:mark-healthy', async (_evt, { version }) => {
    return callPyUpdater(appRoot, pythonExe, 'mark_healthy', { version });
  });

  ipcMain.handle('updater:mark-failed', async (_evt, { version, reason }) => {
    return callPyUpdater(appRoot, pythonExe, 'mark_failed', { version, reason });
  });

  ipcMain.handle('updater:record-crash', async (_evt, { version, reason }) => {
    return callPyUpdater(appRoot, pythonExe, 'record_crash', { version, reason });
  });

  ipcMain.handle('updater:auto-rollback-if-needed', async () => {
    return callPyUpdater(appRoot, pythonExe, 'auto_rollback_if_needed', {});
  });

  // M4 — open native file dialog for picking a .nova-update package
  ipcMain.handle('updater:pick-file', async () => {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') return null;
    const result = await dialog.showOpenDialog({
      title: 'Select .nova-update package',
      properties: ['openFile'],
      filters: [
        { name: 'Nova Update Package', extensions: ['nova-update', 'zip'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // M4 — crash.log reader (writer lands in M5)
  ipcMain.handle('updater:read-crash-log', async () => {
    const crashPath = path.join(appRoot, 'data', 'logs', 'crash.log');
    try {
      const raw = fs.readFileSync(crashPath, 'utf8');
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  });

  // ------------------------------------------------------------------
  // v0.23.3 · HTTP-based auto-update flow
  // ------------------------------------------------------------------
  // Channels:
  //   updater:check-remote        -> { available, latest, current, manifestUrl, downloadUrl, releaseNotes }
  //   updater:download-and-install -> { ok, target_version }
  //
  // The remote endpoint config lives in <appRoot>/data/updater_config.json
  // (so users / IT can self-host without rebuilding):
  //   {
  //     "feed_url": "https://example.com/nova/updates/latest.json",
  //     "channel": "stable"
  //   }
  // The feed_url must point at a JSON manifest of the form
  //   { "version": "0.23.3", "channel": "stable",
  //     "package_url": "https://.../nova-v0.23.3-full.nova-update",
  //     "release_notes_md": "..." }
  ipcMain.handle('updater:check-remote', async () => {
    return checkRemote(appRoot);
  });

  ipcMain.handle('updater:download-and-install', async (_evt, { url } = {}) => {
    if (!url) throw new Error('download-and-install: missing url');
    const cacheDir = path.join(appRoot, 'cache', 'updates');
    fs.mkdirSync(cacheDir, { recursive: true });
    const dest = path.join(cacheDir, `download-${Date.now()}.nova-update`);
    await downloadFile(url, dest);
    // Reuse existing pipeline for verify -> import -> install.
    const manifest = await callPyUpdater(appRoot, pythonExe, 'verify', { path: dest });
    const imported = await callPyUpdater(appRoot, pythonExe, 'import', { path: dest });
    const result = await callPyUpdater(appRoot, pythonExe, 'install', {
      package_id: imported.package_id,
    });
    return { ...result, manifest };
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers (v0.23.3)
// ---------------------------------------------------------------------------

function readFeedConfig(appRoot) {
  const cfgPath = path.join(appRoot, 'data', 'updater_config.json');
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (typeof cfg.feed_url !== 'string' || !cfg.feed_url.trim()) {
      return null;
    }
    return { feed_url: cfg.feed_url, channel: cfg.channel || 'stable' };
  } catch (e) {
    return null; // missing config => auto-update disabled
  }
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    const req = lib.get(url, { headers: { 'user-agent': 'Nova-Updater/1' } }, (res) => {
      if (res.statusCode && (res.statusCode >= 300 && res.statusCode < 400) && res.headers.location) {
        // Follow one redirect.
        res.resume();
        return resolve(httpGetJson(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`feed responded HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`feed returned invalid JSON: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20_000, () => req.destroy(new Error('feed request timed out')));
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    const tmp = `${dest}.partial`;
    const file = fs.createWriteStream(tmp);
    let total = 0;
    const cleanup = (err) => {
      file.close(() => {});
      try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      reject(err);
    };
    const req = lib.get(url, { headers: { 'user-agent': 'Nova-Updater/1' } }, (res) => {
      if (res.statusCode && (res.statusCode >= 300 && res.statusCode < 400) && res.headers.location) {
        res.resume();
        file.close(() => {
          fs.unlink(tmp, () => {
            downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          });
        });
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return cleanup(new Error(`download failed HTTP ${res.statusCode}`));
      }
      total = parseInt(res.headers['content-length'] || '0', 10);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.rename(tmp, dest, (err) => {
            if (err) return reject(err);
            resolve({ path: dest, size: total });
          });
        });
      });
      res.on('error', cleanup);
    });
    req.on('error', cleanup);
    req.setTimeout(120_000, () => req.destroy(new Error('download timed out')));
  });
}

function compareSemver(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function checkRemote(appRoot) {
  const cfg = readFeedConfig(appRoot);
  if (!cfg) {
    return {
      available: false,
      enabled: false,
      reason: 'auto-update feed not configured (missing data/updater_config.json)',
    };
  }
  const current = resolveCurrentVersion(appRoot);
  let feed;
  try {
    feed = await httpGetJson(cfg.feed_url);
  } catch (err) {
    return { available: false, enabled: true, error: err.message, current };
  }
  const latest = feed && typeof feed.version === 'string' ? feed.version : null;
  if (!latest) {
    return { available: false, enabled: true, error: 'feed missing version field', current };
  }
  const channel = feed.channel || cfg.channel || 'stable';
  const newer = current ? compareSemver(latest, current) > 0 : true;
  return {
    available: newer,
    enabled: true,
    current,
    latest,
    channel,
    package_url: feed.package_url || null,
    release_notes_md: feed.release_notes_md || '',
    released_at: feed.released_at || null,
  };
}

module.exports = {
  LINK_TYPE,
  resolveCurrentSlot,
  resolveCurrentVersion,
  readVersionTxt,
  atomicSwitchCurrent,
  bootstrapVersionedLayout,
  registerIpc,
};
