# Data Ownership

This project is local-first. Each data domain has one authoritative owner to avoid hidden double-write behavior.

## Authoritative Domains

- Notes and notebooks: Vault files under `data/vault`.
- Attachments used by notes: Vault assets under `data/vault/_assets`.
- Runtime configuration, tasks, achievements, and UI state: SQLite under `data/second_brain.db`, except secrets.
- Remote model API keys: encrypted local secret storage through the model config repository.
- Vector/search indexes: derived caches that can be rebuilt from Vault and configuration.
- Frontend build output and Electron runtime files: release artifacts, not source of truth.

## Rules

- New note writes must go through the Vault path, either Electron `fsBridge` or backend `VaultStore`.
- SQLite note models are legacy compatibility surfaces and must not become a new write authority.
- Chroma/vector data must be treated as disposable derived state.
- Import, path switching, and recovery flows must preserve or snapshot Vault first.
- Any feature that changes note identity, file path, title, or parentage must define how Vault metadata and watchers stay consistent.

## Migration Direction

The V4 direction is:

1. Freeze legacy SQLite note write paths.
2. Keep backend repositories as a compatibility facade over Vault.
3. Document frontmatter fields shared by Electron and Python.
4. Move destructive local filesystem operations behind Electron-only desktop authorization.
