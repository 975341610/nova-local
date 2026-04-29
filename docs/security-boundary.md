# Security Boundary

Nova is a desktop-first local application with an HTTP backend. The HTTP API is not a trust boundary by itself.

## Local Desktop Trust

Electron is the trusted local shell. It owns:

- Desktop startup token generation.
- Local filesystem user intent.
- Vault directory watching.
- Local-only privileged operations.

High-risk operations run through Electron IPC by default, with explicit user confirmation where data can be moved, overwritten, opened, updated, or restarted.

## Backend Trust

FastAPI owns:

- AI request orchestration.
- Media serving and upload.
- Derived index/search services.
- Compatibility REST APIs.

FastAPI must not silently expose local system actions to normal bearer-token web clients. Legacy HTTP access to high-risk local actions is disabled by default and should only be enabled temporarily for compatibility testing.

## Secret Handling

- API keys are never returned in full through `/api/model-config`.
- UI displays only a masked placeholder.
- Empty key updates preserve the existing secret.
- Stored secrets use OS protection where available and a local encrypted fallback elsewhere.

## Current Guardrails

- Remote AI TLS verification defaults to on.
- Destructive `/api/system/*` and `/api/ai/update-ollama` HTTP routes return `410 Gone` by default.
- `NOVA_ENABLE_LEGACY_SYSTEM_HTTP=true` restores legacy desktop-token HTTP access for compatibility testing only.
- `/system/open-file` is restricted to Vault, uploads, and music roots.
- Renderer code does not receive the desktop token.
- Electron backend stdout/stderr is captured under `data/logs/` for diagnosis.
