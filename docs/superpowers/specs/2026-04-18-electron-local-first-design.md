# Electron Local-First Design

## Goal

Turn `C:\AI\copy` into a real local desktop note app that behaves like Obsidian for core note operations: local window, local vault, direct file writes, folder hierarchy on disk, and near-realtime autosave.

## Approved Direction

- Desktop runtime changes from `Python backend + system browser` to `Electron main window + preload bridge + existing React renderer`.
- Notes and folders become direct local filesystem operations against `data/vault`.
- Python backend is no longer on the critical path for note CRUD or autosave.
- Python remains optional for AI, indexing, media helpers, and compatibility endpoints.

## User Requirements

- Core note editing must not wait on HTTP requests.
- Saving must remain near-realtime even for large notes.
- Notes must live directly in `data/vault` using a file-and-folder model.
- Existing user-facing features should continue to work: templates, themes, note paper, wiki-links, canvas, folder tree.
- `C:\AI\copy` is the real project root. `C:\AI\nova` is only reference material.

## Runtime Architecture

### Electron Main Process

- Creates the application window.
- Owns IPC handlers for local-first note operations.
- Owns native filesystem watchers for vault changes.
- Starts the Python backend only when optional features need it, or eagerly in background if that is simpler, but never blocks editor save.

### Preload Bridge

- Exposes a narrow `window.electron` API to the renderer.
- Provides `ipcInvoke`, note watch subscriptions, and vault-path-aware helper methods.
- Becomes the only renderer entry point for note CRUD in desktop mode.

### Renderer

- Keeps the existing React UI and editor components.
- Switches note CRUD, autosave, folder operations, and rename/move/delete to Electron IPC.
- Keeps HTTP/fetch only for browser-preview fallback and optional backend features.

### Optional Python Backend

- Serves AI endpoints, media uploads, search/indexing, and compatibility routes.
- May still read the same vault, but is not authoritative for editor persistence.

## Storage Model

- Vault root: `C:\AI\copy\data\vault`
- Notes: Markdown files with frontmatter
- Folders: real directories
- Attachments: vault `_assets`
- Trash: vault `.trash`
- Canvas notes: remain files in the vault, using app-defined structured content
- Templates: local files or local SQLite-backed metadata are acceptable, but template application must not depend on HTTP save

## Save Model

### Text Notes

- Editor changes use a short debounce and write directly to disk through Electron IPC.
- Title, paper type, stickers, sticky notes, and other note metadata persist in the same local note file metadata/frontmatter.
- Save completion updates local app state immediately.

### Tree Operations

- Create note: create markdown file immediately in target folder.
- Create folder: create directory immediately.
- Rename: rename file or directory immediately.
- Move: move file or directory immediately.
- Delete: move to `.trash` immediately.
- Restore/purge: handled locally.

### Synchronization

- A filesystem watcher pushes external disk changes back into the renderer so local files remain source of truth.
- Renderer keeps optimistic local state, but watcher and direct read-back remain authoritative if drift occurs.

## Compatibility Rules

- Existing React components should be reused wherever possible.
- Browser mode can keep a fetch fallback for debugging, but desktop mode must prefer IPC with no save fallback to HTTP.
- Existing note IDs may be preserved through vault metadata/id maps as needed, but file paths and vault state become the source of truth.

## Risks And Constraints

- This repo currently has no complete Electron app scaffold in `C:\AI\copy`; it must be added.
- Some existing logic assumes browser mode and HTTP responses; these paths must be split cleanly by runtime.
- Optional backend features may still depend on note IDs or schemas that were previously HTTP-shaped; adapters will be needed.

## Implementation Order

1. Add Electron runtime and one-click startup.
2. Expose preload IPC for local note operations.
3. Move note/folder CRUD and autosave to IPC local-first flow.
4. Reconnect UI features on top of the local-first model.
5. Reintroduce optional backend services without regressing save latency.
