# Runtime Modes

## `desktop_local`

Default mode for the Electron desktop app.

- Backend binds to loopback (`127.0.0.1`) when launched by Electron.
- Electron generates `NOVA_DESKTOP_TOKEN` and sends it as `x-nova-desktop-token`.
- Destructive system actions require that desktop token.
- Ordinary local HTTP calls may still work without `ACCESS_TOKEN` for non-protected startup paths.

## `server_mode`

Use for any browser-accessible or LAN-facing deployment.

- Set `RUN_MODE=server_mode`.
- Set a strong `ACCESS_TOKEN`; startup fails without it.
- Treat desktop-only operations as unavailable from normal web clients.
- Do not expose the backend directly to untrusted networks.

## Protected API Groups

- `/api/model-config`: requires bearer token or desktop token.
- `/api/ai/toggle*`: requires bearer token or desktop token.
- `/api/system/*`: protected, except `/api/system/version`.
- `/api/system/switch-data-path`, `/api/system/update`, `/api/system/restart`, `/api/system/open-file`, `/api/system/import-data`: desktop-token only.

## TLS

Remote AI requests verify TLS certificates by default. `ALLOW_INSECURE_TLS=true` exists only for local debugging with a known proxy and logs a warning when used.
