# V9 Polish Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the V9 baseline by removing the current lint warning, identifying the front-end full-test timeout, and adding repeatable commands for the highest-risk smoke checks.

**Architecture:** This pass does not change product behavior. It improves the engineering safety net around the existing editor, snapshot, PDF, block handle, and packaging systems by keeping changes small and verifiable.

**Tech Stack:** React 19, Vite/Vitest, ESLint, Electron, FastAPI/pytest, PowerShell.

---

### Task 1: Remove The Current Lint Warning

**Files:**
- Modify: `nova-block/src/components/editor/FindReplacePanel.tsx`

- [ ] **Step 1: Inspect the warning location**

Run:

```powershell
npm run lint
```

Expected: ESLint reports one warning in `FindReplacePanel.tsx` for an unused `react-hooks/exhaustive-deps` disable directive.

- [ ] **Step 2: Remove only the unused directive**

In `nova-block/src/components/editor/FindReplacePanel.tsx`, remove the stale `eslint-disable` comment at the warned line. Do not change the hook logic.

- [ ] **Step 3: Verify lint is clean**

Run:

```powershell
npm run lint
```

Expected: `0 errors` and `0 warnings`.

### Task 2: Identify Front-End Full-Test Timeout

**Files:**
- Read: `nova-block/src/test/**/*.test.ts`
- Read: `nova-block/src/test/**/*.test.tsx`

- [ ] **Step 1: Run the full test suite with a longer timeout**

Run:

```powershell
npm test
```

Expected: If it still exceeds 5 minutes, capture the last visible suite name and elapsed time.

- [ ] **Step 2: Run heavy suites by risk area**

Run:

```powershell
npm test -- --run src/test/sidebar-ai-import-generate.test.tsx
npm test -- --run src/test/document-attachment-view.test.tsx
npm test -- --run src/test/novablock/drag-handle-positioning.test.ts
npm test -- --run src/test/desktop-runtime-guards.test.ts
```

Expected: Each command either passes or identifies the slow suite.

- [ ] **Step 3: Record the result**

If the timeout is environmental but the risk suites pass, record the recommended command set in the final response. If a suite hangs, do not patch randomly; inspect that suite and isolate the specific test.

### Task 3: Confirm V9 High-Risk Smoke Checks

**Files:**
- Read: `electron/test/*.test.js`
- Read: `backend/api/*test.py`
- Read: `nova-block/src/test/autosave-regressions.test.ts`
- Read: `nova-block/src/test/document-attachment-view.test.tsx`
- Read: `nova-block/src/test/novablock/drag-handle-positioning.test.ts`

- [ ] **Step 1: Run Electron safety checks**

Run:

```powershell
node --test electron\test\mainStartup.test.js electron\test\windowCloseBehavior.test.js electron\test\installerConfig.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run backend tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest backend -q
```

Expected: all tests pass except known skips.

- [ ] **Step 3: Run front-end high-risk checks**

Run:

```powershell
npm test -- --run src/test/autosave-regressions.test.ts src/test/document-attachment-view.test.tsx src/test/novablock/drag-handle-positioning.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: build succeeds.

### Task 4: Commit The Polish Baseline

**Files:**
- Modify: `nova-block/src/components/editor/FindReplacePanel.tsx`
- Create: `docs/superpowers/plans/2026-06-04-v9-polish-foundation.md`

- [ ] **Step 1: Review diff**

Run:

```powershell
git diff --stat
git diff -- nova-block/src/components/editor/FindReplacePanel.tsx docs/superpowers/plans/2026-06-04-v9-polish-foundation.md
```

Expected: only the plan and the lint cleanup changed.

- [ ] **Step 2: Commit**

Run:

```powershell
git add nova-block/src/components/editor/FindReplacePanel.tsx docs/superpowers/plans/2026-06-04-v9-polish-foundation.md
git commit -m "chore: document v9 polish baseline"
```

Expected: commit succeeds.

