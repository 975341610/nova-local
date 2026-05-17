# QingZhi V9 Shell Redesign Spec

## Goal

Rebuild the Nova desktop shell around the QingZhi identity and the `qingzhi-redesign-preview-v3` direction, while preserving the existing note, search, backlinks, AI, version history, settings, update, and desktop-window logic.

This is an appearance and layout refactor. Business behavior should move into new containers instead of being rewritten.

## Source Of Truth

- Target preview: `C:/Users/Admin/Downloads/qingzhi-redesign-preview-v3.zip`, especially `qingzhi-preview.html`.
- Current corrected product requirement: the user-provided QingZhi screenshot with a single left navigation/sidebar, one main editor area, and a collapsible TOC on the far right.
- Preferred art assets are the user-provided QingZhi character, illustration, UI reference,
  and supplemental icon images under `C:/AI/.../笔记UI参考图/`.

## Hard Layout Requirements

```text
+------------------------------------------------------------------------------+
| Topbar                                                                       |
| [QingZhi logo/sidebar toggle] QingZhi   [4 fixed buttons] [...] [avatar] [_][O][X] |
+------------------+----------------------------------------------+------------+
| Left Sidebar     | Main Editor                                  | Right TOC  |
|                  |                                              | collapsible|
| [Files][Search]  | Editor toolbar row                           |            |
| [Backlinks][AI]  | left: save status light                      | outline    |
|                  | right: 9 tool buttons                        | current    |
| Quick search     |                                              | section    |
|                  | Full note title                              | anchors    |
| Active panel:    | small breadcrumb directly below title         |            |
| file tree /      | tags area                                    |            |
| search results / | note metadata area                           |            |
| backlinks / AI   | note body                                    |            |
|                  |                                              |            |
| bottom settings  |                                              |            |
+------------------+----------------------------------------------+------------+
```

The layout must not include the old middle note-list column, and must not use an edit/preview split layout as the default writing surface.

## Topbar

The topbar is a QingZhi desktop title bar:

- Far left is the QingZhi logo/brand area.
- Clicking the logo area toggles the left sidebar collapsed/expanded.
- Right side contains four fixed common actions, then a more button, avatar, and desktop window controls.
- Existing desktop window control behavior must remain wired through the current Electron bridge.
- Topbar actions must use compact icon buttons with tooltips where possible.

## Left Sidebar

The left sidebar becomes the only primary side navigation column:

- Four tab buttons at the top:
  - Files / note tree
  - Search
  - Backlinks
  - AI
- Below the tabs is quick search.
- Below quick search is the active panel content.
- The Files tab shows the existing notebook/folder/note tree.
- The Search tab reuses existing search behavior.
- The Backlinks tab reuses existing backlinks behavior.
- The AI tab reuses the existing AI workbench behavior.
- Bottom area keeps settings / space-management entry.

There must be no separate center note-list column.

## Main Editor

The main editor contains one writing surface:

- First row inside the editor area:
  - Left: save status indicator, such as `SYNCED`.
  - Right: nine existing tool actions, preserved as icon buttons.
- Below the toolbar:
  - Full note title.
  - Small breadcrumb directly under the title.
  - Tags.
  - Note metadata.
  - Note body.
- Existing editor behavior, autosave behavior, version history, inline AI, attachments, media cards, footnotes, backlinks extraction, and reader mode behavior must continue working.

## Right TOC

The TOC is on the far right, not the left:

- It is collapsible.
- It shows the current note outline.
- It should not cover editor content when open.
- When collapsed, it should leave a slim handle or icon affordance.

## Visual System

The shell should feel like QingZhi:

- Palette: jade, warm paper, ink, muted gold, soft blush accents.
- Surface: warm paper background, subtle borders, soft shadows, calm spacing.
- Assets: use the supplied QingZhi character and ink-wash assets first.
- Decorative art should support the UI and must not block reading or editing.
- Icons should stay compact and functional; use QingZhi assets for brand accents, not for every control if it harms clarity.

## Preservation Rules

Do not rewrite business features while changing layout:

- Version history entry and restore logic remain intact.
- AI workbench, import, ask, write, citations, and insertion logic remain intact.
- Search behavior remains intact.
- Backlinks behavior remains intact.
- Settings and update flows remain intact.
- Packaging and updater logic remain untouched unless a build break forces a small compatibility fix.

## Testing And Verification

Add/adjust tests that check layout contracts:

- Topbar has QingZhi brand/toggle, four fixed actions, more button, avatar, and window controls.
- Left sidebar exposes exactly the four primary tabs: files, search, backlinks, AI.
- There is no middle note-list column in the app shell.
- Main editor has save status, nine editor tool buttons, title, breadcrumb, tags, metadata, and body container.
- TOC is rendered on the right and is collapsible.
- QingZhi assets resolve from the application public assets.

Verification must include:

- Targeted Vitest tests for QingZhi shell/layout.
- `npm run build` in `nova-block`.
- A Playwright/browser screenshot comparison pass against the local app when a local frontend can run.

## Open Implementation Notes

The current V9 branch contains existing QingZhi experiments and backup folders. The implementation should not blindly revert them. It should keep useful asset imports and visual tokens, remove or bypass obsolete layout assumptions, and avoid destructive cleanup until the new shell is passing tests.
