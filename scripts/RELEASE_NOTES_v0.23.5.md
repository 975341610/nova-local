# Nova v0.23.5 AI mode switching update

## Changes

- Added AI engine mode switching between remote AI and local AI.
- Default AI mode is now remote AI.
- Local AI is only initialized when explicitly selected.
- Remote AI indexing and chat no longer get preempted by local AI state.
- Added frontend Settings UI controls for remote/local AI mode selection.
- Fixed remote inline AI streaming so it uses fetch/SSE directly instead of the Electron request/response IPC bridge.
- Fixed inline AI SSE error handling and final unterminated stream frame handling.
- Fixed inline AI remote generator JSON scoping regression.
- Fixed AI-generated Markdown insertion so headings, bold text, code, lists, paragraphs, and blockquotes are inserted as structured editor content instead of raw Markdown text.
- Restored visible streaming experience for AI Markdown output by streaming into a temporary preview block and replacing it with structured editor content when generation completes.
- Added controlled Markdown prompt rules for inline AI output to reduce malformed editor content.
- Added first-pass document import normalization for Markdown/text/PDF/CSV content and lightweight article HTML extraction for future URL imports.
- Added AI structured note generation from normalized imported content, with a deterministic Markdown fallback when remote AI is unavailable.
- Added generated-note persistence flow so AI-organized imports are saved as normal notes and enter the existing knowledge-base indexing pipeline for Q&A.
- Added dedicated `/import/generate-note` backend endpoint for the productized AI import flow: single-file and multi-file imports are merged into one normalized content payload and returned as one structured AI整理 Markdown result.
- Added a sidebar “AI 导入整理” button with multi-file picker support for Markdown, text, CSV, and PDF files.
- Added frontend API client support for importing files, generating one AI整理 result, converting Markdown into editor HTML, and creating the final note through the local vault note API.
- Fixed AI 导入整理 notes created from PDFs and other files so they display as structured editor content instead of raw Markdown.
- Fixed AI 导入整理 deletion in the desktop app by ensuring generated notes are created in the same local vault path used by `notes:delete`.
- Fixed editor undo isolation when switching notes so Ctrl+Z in the new note cannot restore the previous note content or pollute the selected note with another note's draft.
- Fixed revision history auto-save snapshots so debounce no longer overwrites the previous history version; changed content creates a new version after the debounce window while unchanged content is still deduplicated, and the desktop app now schedules a final snapshot after the user stops typing so the completed edit is preserved.
- Added frontend API clients for generating and persisting structured notes from imported content.
- Added Reader compatibility for older AI outputs saved as Markdown-like text inside HTML paragraphs.
- Added backend helper tests and frontend regression tests for AI mode, inline streaming, AI import, Markdown rendering, editor undo isolation, and revision snapshot debounce behavior.

## Notes

This package was built as an unsigned development package because the current Linux packaging environment cannot run the Windows `package_release.bat` / PowerShell entrypoint directly and no release signing key was available in the environment.
