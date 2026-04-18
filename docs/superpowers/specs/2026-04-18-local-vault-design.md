# Local Vault Design

## Goal

Turn note storage into a local vault model where notes, folders, trash items, and attachments are stored directly on disk while preserving the current API and desktop usage patterns.

## Scope

- Notes become Markdown files in a vault directory.
- Folder hierarchy becomes real directories on disk.
- Attachments live in a vault `_assets` directory.
- Trash becomes a real `.trash` directory.
- Existing task, settings, achievement, and AI config storage may remain in SQLite for now.

## Storage Model

- `data_root/vault/` is the default vault root.
- Each note is a Markdown file with YAML frontmatter.
- Each file contains a stable UUID in frontmatter so the app can rebuild IDs and metadata.
- Directories represent folders and notebooks.
- Canvas and templates are out of scope for the first migration and may continue using existing storage until a later pass.

## Compatibility Rules

- Files must remain human-readable.
- The app must read and write notes directly from disk.
- Existing API responses should remain close to the current `NoteResponse` and `NotebookResponse` shapes.
- SQLite note rows, if kept, are cache/compatibility artifacts only and must not be the source of truth.

## Behavior

- Create note: create a Markdown file on disk, then surface it through repositories.
- Rename note: rename the file and update the title in frontmatter.
- Move note: move the file to a different directory.
- Delete note: move the file to `.trash/` and mark it deleted in any compatibility cache.
- Restore note: move the file back into the default notebook/folder when possible.
- Create folder/notebook: create a directory.
- Delete folder/notebook: move the directory tree into `.trash/`.

## Frontmatter Shape

```yaml
---
id: 123
uuid: "generated-uuid"
title: "Note title"
icon: "📝"
tags:
  - one
  - two
type: "note"
created_at: "2026-04-18T00:00:00+08:00"
updated_at: "2026-04-18T00:00:00+08:00"
nova:
  is_title_manually_edited: false
---
```

## Non-Goals

- Full Obsidian plugin runtime compatibility.
- Replacing every SQLite-backed feature in one pass.
- Reworking the editor UX.
