# AI Import Files 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first stable file-first AI import flow: preview selected files, choose an organization template, generate a structured note, and save it into Nova as knowledge.

**Architecture:** Reuse the existing import parsing, note generation, and sidebar entry. Add a backend preview endpoint and a template-aware generation path, then replace the one-click sidebar import with a lightweight preview panel.

**Tech Stack:** FastAPI, SQLAlchemy service layer, Vitest/React Testing Library, existing Nova API client, existing `aiMarkdownToHtml` renderer.

---

### Task 1: Backend Preview And Template Contract

**Files:**
- Modify: `backend/models/schemas.py`
- Modify: `backend/api/routes.py`
- Modify: `backend/services/document_service.py`
- Modify: `backend/services/import_generation.py`
- Modify: `backend/services/note_generation.py`
- Test: `tests/test_import_generate_note.py`
- Test: `tests/test_document_import_pipeline.py`

- [ ] Add response types for file preview rows and preview response.
- [ ] Add `POST /api/import/preview` that parses files without persisting notes.
- [ ] Add a `template_id` form field to `/api/import/generate-note`.
- [ ] Preserve source names, template id, and file count in generated metadata.
- [ ] Keep unsupported/empty files visible in preview with clear status and message.

### Task 2: Frontend API Contract

**Files:**
- Modify: `nova-block/src/lib/types.ts`
- Modify: `nova-block/src/lib/api.ts`
- Test: `nova-block/src/test/importAndGenerateNote.test.ts`

- [ ] Add `ImportPreviewResponse` and `ImportTemplateId` types.
- [ ] Add `api.previewImportFiles(files)`.
- [ ] Let `api.importAndGenerateNote(files, options)` include `template_id` in `FormData`.

### Task 3: Sidebar Import Panel

**Files:**
- Modify: `nova-block/src/components/sidebar/SidebarTree.tsx`
- Test: `nova-block/src/test/sidebar-ai-import-generate.test.tsx`

- [ ] Replace direct one-click generation with a lightweight preview panel.
- [ ] Show selected files, parse status, content summary, and template picker.
- [ ] Generate and save one structured note after confirmation.
- [ ] Preserve existing store update and note selection behavior.

### Task 4: Verification

**Commands:**
- `python -m pytest tests\test_document_import_pipeline.py tests\test_import_generate_note.py -q`
- `npm run test -- importAndGenerateNote.test.ts sidebar-ai-import-generate.test.tsx`
- `npm run build`

