# QingZhi V9 Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the V9 app shell into the approved QingZhi layout with one left navigation sidebar, one main editor, and a collapsible right TOC.

**Architecture:** Keep existing business components and move them into QingZhi layout containers. App owns the topbar and left sidebar. NovaBlockEditor owns the editor content and right TOC because heading outline state already lives there.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind utility classes, existing QingZhi CSS variables/assets.

---

### Task 1: Shell Contract Tests

**Files:**
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/test/qingzhi-app-shell.test.tsx`
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/test/qingzhi-editor-header.test.tsx`
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/test/qingzhi-sidebar-tree.test.tsx`
- Create: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/test/qingzhi-toc.test.tsx`

- [ ] **Step 1: Write failing tests**

Assert that App renders the QingZhi topbar with four fixed action buttons, the logo sidebar toggle, a more button, an avatar, and a single sidebar region. Assert that NovaBlockEditor/TableOfContents exposes a right-side TOC region and does not expose a middle note-list region.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/test/qingzhi-app-shell.test.tsx src/test/qingzhi-editor-header.test.tsx src/test/qingzhi-sidebar-tree.test.tsx src/test/qingzhi-toc.test.tsx`

Expected: FAIL because the current right TOC shell contract is not yet implemented.

### Task 2: Topbar And Sidebar Polish

**Files:**
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/App.tsx`
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/components/sidebar/SidebarTree.tsx`

- [ ] **Step 1: Implement the minimal shell changes**

Keep `SidebarTree` as the only left navigation column. Keep the topbar logo button wired to `setIsSidebarCollapsed`. Add stable `data-testid` markers for fixed action icons/labels, more button, avatar, and the absence of a middle list.

- [ ] **Step 2: Run Task 1 tests**

Run the same Vitest command. Expected: App and Sidebar tests pass; TOC may still fail until Task 3.

### Task 3: Right TOC Layout

**Files:**
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/components/novablock/NovaBlockEditor.tsx`
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/components/novablock/components/TableOfContents.tsx`
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/styles/themes.css`
- Modify: `C:/AI/nova-local-v0.18.0/nova-local/nova-block/src/index.css`

- [ ] **Step 1: Move TOC into a reserved right column**

Wrap the editor paper shell and `TableOfContents` in a QingZhi editor layout. Make the TOC static within the right column instead of fixed over editor content. Render an empty TOC shell when outline is empty so layout remains stable.

- [ ] **Step 2: Run Task 1 tests**

Expected: all targeted QingZhi layout tests pass.

### Task 4: Build And Visual Verification

**Files:**
- Modify CSS only if verification finds layout overlap.

- [ ] **Step 1: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Run local screenshot verification**

Start the frontend if needed and capture the local app. Confirm topbar, one left sidebar, main editor, and far-right TOC match the approved structure.
