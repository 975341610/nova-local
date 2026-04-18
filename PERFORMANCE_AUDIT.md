# Nova Performance Audit Report

**Date:** 2026-04-10
**Audit Status:** Completed & Fixed
**Key Focus:** Global performance bottlenecks including Base64 abuse, FastAPI event loop blocking, and high-frequency frontend saves.

---

## 1. Fatals & Fixes

### A. Base64 Abuse (Memory & Storage Bloat)
**Issue:** Frontend components (HabitTracker, Moodboard) were reading files as massive Data URLs (Base64) and sending them to the backend or storage. This caused browser memory spikes and database bloat.
**Fixes:**
-   **HabitTrackerComponent.tsx**: Removed `fileToDataUrl` and Base64 fallbacks. Now strictly uses `api.upload` for persistent storage and displays images via URLs.
-   **MoodboardView.tsx**: Replaced `FileReader.readAsDataURL` with `URL.createObjectURL` for ephemeral display, drastically reducing immediate memory consumption.
-   **Backend**: Optimized media upload routes to handle file objects directly rather than parsing encoded strings.

### B. FastAPI Event Loop Blocking (API Latency)
**Issue:** Numerous `async def` endpoints were performing synchronous database operations (SQLAlchemy) and I/O tasks. This blocked the FastAPI event loop, causing the entire backend to hang under load.
**Fixes:**
-   Converted DB-intensive routes from `async def` to regular `def`. FastAPI now executes these in a background thread pool automatically.
-   Routes affected: `quick_capture_api`, `create_note_api`, `update_note_api`, `upload_media_api`, etc.
-   Remaining `async def` routes (AI-related) now use `await run_in_threadpool()` for all synchronous database interactions to ensure the event loop remains responsive.

### C. Large Payload Transfers (Network & Memory Efficiency)
**Issue:** `GET /notes` and `GET /notes/tree` endpoints were returning the full `content` field for every note. For users with large knowledge bases, this resulted in multi-megabyte JSON payloads for simple list rendering.
**Fixes:**
-   **API Splitting**: Implemented "Scheme A": The list endpoints now return a lightweight `NoteListItemResponse` (excluding `content`).
-   **Lazy Loading**: Added `GET /notes/{note_id}` for fetching full note details.
-   **Frontend Update**: Modified `App.tsx` to fetch note content on-demand when a note is selected in the UI.
-   **Database Optimization**: Used SQLAlchemy's `defer(Note.content)` to avoid loading heavy text fields into memory during list queries.

### D. Frequent Frontend Saves (Serialization Lag)
**Issue:** `CanvasEditor.tsx` (ReactFlow) was serializing the entire node/edge state including ephemeral runtime properties like `selected`, `dragging`, and `measured`. Every click or hover triggered a "state change" that resulted in a full database save operation.
**Fixes:**
-   **Surgical Serialization**: Modified `serializeCanvasContent` to pick only persistent fields (`id`, `type`, `position`, `data`, `style`, `parentId`).
-   **Runtime Pruning**: Explicitly removed injected function handlers (`onChange`, `onToggleCollapse`, etc.) from the serialized JSON.
-   **Debounce Verification**: Ensured saves only trigger when meaningful content or layout changes occur.

---

## 2. Quantitative Improvements (Estimated)
-   **Initial Load Time**: Reduced by ~60% for large note sets due to content deferral.
-   **Backend Throughput**: Increased by ~4x under concurrent I/O load by unblocking the event loop.
-   **Frontend Stability**: Reduced "QuotaExceededError" risk in LocalStorage by eliminating Base64 blobs.
-   **Editor Lag**: 650ms debounce now effectively filters out all transient UI state changes in Canvas.

---

## 3. Recommended Next Steps
-   **Pagination**: While payload size is reduced, the list is still unpaginated. For >1000 notes, implementing `limit/offset` is recommended.
-   **Media Compression**: Implement server-side image resizing for uploaded stickers and avatars to further optimize bandwidth.
-   **Web Worker Search**: Move the global search filtering in `GlobalSearchPanel.tsx` to a Web Worker to avoid UI jitters during large searches.
