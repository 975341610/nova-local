# Security Boundary

Nova is a desktop-first local application with an HTTP backend. The HTTP API is not a trust boundary by itself.

## Local Desktop Trust

Electron is the trusted local shell. It owns:

- Desktop startup token generation.
- Local filesystem user intent.
- Vault directory watching.
- Local-only privileged operations.

High-risk operations should move toward Electron IPC, with explicit user confirmation where data can be moved, overwritten, opened, updated, or restarted.

## Backend Trust

FastAPI owns:

- AI request orchestration.
- Media serving and upload.
- Derived index/search services.
- Compatibility REST APIs.

FastAPI must not silently expose local system actions to normal bearer-token web clients.

## Secret Handling

- API keys are never returned in full through `/api/model-config`.
- UI displays only a masked placeholder.
- Empty key updates preserve the existing secret.
- Stored secrets use OS protection where available and a local encrypted fallback elsewhere.

## Current V4 Guardrails

- Remote AI TLS verification defaults to on.
- Destructive `/api/system/*` routes require `x-nova-desktop-token`.
- `/system/open-file` is restricted to Vault, uploads, and music roots.
- Electron backend stdout/stderr is captured under `data/logs/` for diagnosis.
