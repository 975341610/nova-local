"""backend.services.updater_cli — JSON-over-stdin RPC for Electron bridge.

Electron's `updaterBridge.js` shells out to this module; request comes on
stdin as a single JSON object `{"action": "...", "args": {...}}`, response
goes on stdout as JSON. On error we still return JSON with a non-zero exit.

Actions:
    verify              args: {path}              -> manifest dict
    import              args: {path}              -> {package_id, manifest}
    install             args: {package_id}        -> {success, target_version, previous_version}
    list_versions       args: {}                  -> [InstalledVersion...]
    switch_to           args: {version}           -> {success, from, to}
    get_rollback_target args: {}                  -> str | None
    get_current_version args: {}                  -> str | None
    bootstrap           args: {}                  -> {ok}
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from dataclasses import asdict, is_dataclass
from pathlib import Path

from backend.services.updater_pkg import ValidationError, PackageError
from backend.services.updater_service import UpdaterError, UpdaterService


def _dump(value):
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, list):
        return [_dump(x) for x in value]
    if isinstance(value, dict):
        return {k: _dump(v) for k, v in value.items()}
    if isinstance(value, Path):
        return str(value)
    return value


def dispatch(svc: UpdaterService, action: str, args: dict):
    if action == "bootstrap":
        svc.bootstrap()
        return {"ok": True}

    if action == "verify":
        manifest = svc.verify_package(Path(args["path"]))
        return manifest.to_dict()

    if action == "import":
        result = svc.import_package(Path(args["path"]))
        return {
            "package_id": result.manifest.package_id,
            "cached_path": str(result.cached_path),
            "manifest": result.manifest.to_dict(),
        }

    if action == "install":
        result = svc.install(args["package_id"])
        return _dump(result)

    if action == "list_versions":
        return [_dump(v) for v in svc.list_versions()]

    if action == "switch_to":
        result = svc.switch_to(args["version"])
        return _dump(result)

    if action == "get_rollback_target":
        return svc.get_rollback_target()

    if action == "get_current_version":
        return svc.get_current_version()

    if action == "mark_healthy":
        svc.mark_healthy(args["version"])
        return {"ok": True}

    if action == "mark_failed":
        result = svc.mark_failed(args["version"], reason=args.get("reason", ""))
        return _dump(result)

    if action == "record_crash":
        svc.record_crash(args["version"], reason=args.get("reason", ""))
        return {"ok": True}

    if action == "auto_rollback_if_needed":
        return _dump(svc.auto_rollback_if_needed())

    if action == "backup_data_dir":
        return str(svc.backup_data_dir(label=args["label"]))

    raise UpdaterError(f"unknown action: {action}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="updater_cli")
    parser.add_argument("--app-root", required=True)
    parser.add_argument("--retention", type=int, default=None)
    ns = parser.parse_args(argv)

    try:
        payload_raw = sys.stdin.read().lstrip("\ufeff")
        payload = json.loads(payload_raw) if payload_raw.strip() else {}
        action = payload.get("action")
        args = payload.get("args") or {}
        if not action:
            raise UpdaterError("missing 'action' in stdin payload")

        svc = UpdaterService(Path(ns.app_root), retention=ns.retention)
        svc.bootstrap()
        result = dispatch(svc, action, args)
        json.dump(result, sys.stdout, ensure_ascii=False)
        sys.stdout.flush()
        return 0
    except (UpdaterError, ValidationError, PackageError) as exc:
        sys.stderr.write(f"{type(exc).__name__}: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        return 1
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"unexpected error: {exc}\n{traceback.format_exc()}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
