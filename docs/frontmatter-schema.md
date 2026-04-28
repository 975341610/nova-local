# Vault Frontmatter Schema

Vault note files use Markdown with YAML frontmatter.

## Note File Fields

- `id`: integer, stable local note id.
- `uuid`: string, globally unique note identity.
- `title`: string, display title.
- `icon`: string, display icon.
- `summary`: string, generated or user-visible summary.
- `tags`: string array.
- `type`: string, commonly `note`, `canvas`, or workflow-specific note type.
- `created_at`: ISO-8601 datetime string.
- `updated_at`: ISO-8601 datetime string.
- `deleted_at`: ISO-8601 datetime string or null, used for trash state.
- `sort_key`: string, local ordering key.
- `is_title_manually_edited`: boolean.
- `background_paper`: string or null.
- `stickers`: array of sticker objects.
- `sticky_notes`: array of sticky-note objects.
- `properties`: array of `{ id, name, type, value }` objects.
- `links`: array of target note ids for manual links.
- `ai_links`: array of target note ids for AI-derived links.
- `original_rel_path`: string or null, used when item is moved to trash.

## Directory Metadata

Notebook metadata lives in `.notebook.yml`.

- `id`: integer.
- `name`: string.
- `icon`: string.
- `created_at`: ISO-8601 datetime string.
- `deleted_at`: ISO-8601 datetime string or null.

Folder metadata lives in `.folder.yml`.

- Same identity/display fields as notes.
- `type` should remain `note` unless a specific folder-like type is introduced.
- Content is represented by child files rather than Markdown body.

## Compatibility Rules

- Python uses PyYAML and Electron uses the `yaml` npm package.
- Readers must accept standard block-style YAML arrays and objects.
- Writers should preserve unknown fields where practical by merging existing metadata before writing.
- Chroma and search indexes must be rebuilt from these files, not treated as source data.
