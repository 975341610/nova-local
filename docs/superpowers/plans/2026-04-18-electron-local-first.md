# Electron Local-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-based desktop runtime with an Electron desktop app and move note persistence onto a local-first IPC path that writes directly to `data/vault`.

**Architecture:** Add a focused Electron layer with `main`, `preload`, and local vault services, then route note CRUD and autosave through that bridge while keeping the existing React UI. Python becomes optional infrastructure, not the save path.

**Tech Stack:** Electron, Node.js filesystem APIs, React/Vite frontend, Python backend for optional services, Markdown/frontmatter vault storage, Vitest, pytest

---

## File Map

- Create: `electron/package.json`
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Create: `electron/fsBridge.js`
- Create: `electron/vaultWatcher.js`
- Create: `electron/test/fsBridge.test.js`
- Modify: `start_windows.bat`
- Modify: `nova-block/src/lib/api.ts`
- Modify: `nova-block/src/App.tsx`
- Modify: `nova-block/src/components/novablock/NovaBlockEditor.tsx`
- Modify: `nova-block/src/components/canvas/CanvasEditor.tsx`
- Modify: `nova-block/src/lib/types.ts`
- Modify: `backend/desktop.py` or retire it from the startup path

### Task 1: Scaffold Electron desktop runtime

**Files:**
- Create: `electron/package.json`
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Modify: `start_windows.bat`
- Test: manual launch smoke from Windows batch entrypoint

- [ ] Add an Electron package with `electron` as a runtime dependency and scripts for desktop launch.
- [ ] Create `electron/main.js` that opens a desktop window pointed at the built frontend in `C:\AI\copy\frontend_dist`.
- [ ] Create `electron/preload.js` exposing a safe `window.electron.ipcInvoke` bridge.
- [ ] Update `start_windows.bat` so one-click start launches Electron instead of opening the system browser path.
- [ ] Verify the app window opens from `C:\AI\copy\start_windows.bat`.

### Task 2: Build a local vault filesystem bridge

**Files:**
- Create: `electron/fsBridge.js`
- Create: `electron/test/fsBridge.test.js`
- Test: `electron/test/fsBridge.test.js`

- [ ] Write failing tests for local note create, update, rename, move, and folder create against a temp vault.
- [ ] Implement a focused filesystem bridge that reads and writes markdown/frontmatter note files under `data/vault`.
- [ ] Include folder operations, trash moves, and metadata persistence for `background_paper`, stickers, sticky notes, and note type.
- [ ] Run the fs bridge tests and make them pass.

### Task 3: Expose note CRUD over Electron IPC

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/fsBridge.js`
- Create: `electron/vaultWatcher.js`

- [ ] Register IPC handlers for `notes:list`, `notes:get`, `notes:create`, `folders:create`, `notes:update`, `notes:delete`, move, restore, purge, and rename-adjacent flows.
- [ ] Add a vault watcher that emits note-change events back to the renderer.
- [ ] Make sure desktop note operations never proxy to HTTP.
- [ ] Smoke-test IPC calls locally from the renderer.

### Task 4: Rewire the frontend to local-first desktop saves

**Files:**
- Modify: `nova-block/src/lib/api.ts`
- Modify: `nova-block/src/App.tsx`
- Modify: `nova-block/src/lib/types.ts`
- Test: `nova-block/src/test/api-client.test.ts`

- [ ] Split API behavior cleanly between Electron mode and browser fallback mode.
- [ ] Ensure note/folder CRUD in desktop mode routes only through IPC.
- [ ] Keep browser fetch fallback for debugging, but remove desktop save fallback to HTTP.
- [ ] Update or add tests proving desktop mode calls IPC and browser mode still uses fetch.

### Task 5: Restore realtime autosave behavior

**Files:**
- Modify: `nova-block/src/components/novablock/NovaBlockEditor.tsx`
- Modify: `nova-block/src/components/canvas/CanvasEditor.tsx`
- Test: targeted editor/manual smoke

- [ ] Reduce autosave delay for desktop local mode to a short debounce suitable for near-realtime writes.
- [ ] Keep save operations non-blocking from the editor’s point of view.
- [ ] Preserve explicit metadata saves for note paper, templates, sticky notes, stickers, and canvas content.
- [ ] Confirm large-note editing no longer waits on Python route latency.

### Task 6: Reconnect tree operations and known regressions on top of local-first storage

**Files:**
- Modify: `nova-block/src/App.tsx`
- Modify: any Electron IPC handlers needed for tree actions
- Test: manual smoke and existing vault tests

- [ ] Verify folder creation creates real folders, not regular notes.
- [ ] Verify rename, move, delete, restore, and purge work for both notes and folders.
- [ ] Verify legacy localStorage migration still imports old notes into the vault when present.
- [ ] Verify templates, themes, note paper, and wiki-link UI still work after the runtime split.

### Task 7: Final verification

**Files:**
- Test: Electron desktop launch, renderer build, targeted pytest/vitest suites

- [ ] Run frontend tests relevant to API/runtime splits.
- [ ] Run Python vault regression tests.
- [ ] Build the renderer bundle.
- [ ] Launch the desktop app and perform a smoke test that creates and edits a note and verifies direct writes in `C:\AI\copy\data\vault`.
- [ ] Record any remaining browser-only or backend-only gaps separately from the core desktop save path.
