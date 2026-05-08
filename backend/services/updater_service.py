"""Nova UpdaterService — version-slotted install/switch/rollback (M2).

Responsibility:
    - Owns app_root/versions/<X.Y.Z>/ slots
    - Owns app_root/current symlink (or junction — on Windows, handled by M3 wrapper)
    - Owns app_root/versions/.index.json metadata
    - Owns app_root/rollback_pointer.json (previous healthy version)
    - Owns app_root/cache/updates/ imported package cache
    - NEVER writes to app_root/data/

Out of M2 scope (stubs / hooks will be added in M3+):
    - Running migrations/*.mjs
    - Health self-check + auto rollback (M5)
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import shutil
import subprocess
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from backend.services.updater_pkg import (
    Manifest,
    PackageError,
    ValidationError,
    validate_package,
)


# ---------------------------------------------------------------------------
# Public errors / dataclasses
# ---------------------------------------------------------------------------


class UpdaterError(Exception):
    """Raised when an install/switch operation cannot proceed."""


@dataclass
class ImportResult:
    manifest: Manifest
    cached_path: Path


@dataclass
class InstallResult:
    success: bool
    target_version: str
    previous_version: str | None


@dataclass
class SwitchResult:
    success: bool
    from_version: str | None
    to_version: str


@dataclass
class FailureResult:
    version: str
    failed_count: int
    disabled: bool


@dataclass
class AutoRollbackResult:
    rolled_back: bool
    from_version: str | None
    to_version: str | None


@dataclass
class InstalledVersion:
    version: str
    installed_at: str
    is_current: bool
    healthy: bool
    disabled: bool
    failed_count: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_semver(v: str) -> tuple[int, int, int]:
    core = v.split("-", 1)[0]
    parts = core.split(".")
    if len(parts) != 3:
        raise UpdaterError(f"bad semver: {v}")
    try:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError as e:
        raise UpdaterError(f"bad semver: {v}") from e


def _semver_cmp(a: str, b: str) -> int:
    ta, tb = _parse_semver(a), _parse_semver(b)
    return (ta > tb) - (ta < tb)


def _now_iso_utc() -> str:
    return _dt.datetime.now(tz=_dt.timezone.utc).replace(microsecond=0).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def _is_windows() -> bool:
    return os.name == "nt"


def _create_dir_link(target: Path, link: Path) -> None:
    """Create a directory link suitable for the current OS."""
    if _is_windows():
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(target)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise UpdaterError(f"failed to create Windows junction: {detail}")
        return
    os.symlink(target, link, target_is_directory=True)


def _remove_path_link_or_dir(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    if _is_windows():
        try:
            path.rmdir()
            return
        except OSError:
            pass
    shutil.rmtree(path)


# ---------------------------------------------------------------------------
# UpdaterService
# ---------------------------------------------------------------------------


class UpdaterService:
    DEFAULT_RETENTION = 5

    def __init__(self, app_root: Path, *, retention: int | None = None) -> None:
        self.app_root = Path(app_root).resolve()
        self.versions_dir = self.app_root / "versions"
        self.current_link = self.app_root / "current"
        self.cache_dir = self.app_root / "cache" / "updates"
        self.index_path = self.versions_dir / ".index.json"
        self.rollback_path = self.app_root / "rollback_pointer.json"
        self.retention = retention if retention is not None else self.DEFAULT_RETENTION

    # ----- Bootstrap ---------------------------------------------------------

    def bootstrap(self) -> None:
        self.app_root.mkdir(parents=True, exist_ok=True)
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        if not self.index_path.is_file():
            _atomic_write_json(self.index_path, {"versions": []})

    # ----- Index I/O ---------------------------------------------------------

    def _read_index(self) -> dict:
        if not self.index_path.is_file():
            return {"versions": []}
        return json.loads(self.index_path.read_text(encoding="utf-8"))

    def _write_index(self, data: dict) -> None:
        _atomic_write_json(self.index_path, data)

    def _upsert_index_entry(
        self,
        version: str,
        *,
        healthy: bool = True,
        disabled: bool = False,
    ) -> None:
        idx = self._read_index()
        entries: list[dict] = idx.get("versions", [])
        now = _now_iso_utc()
        for e in entries:
            if e.get("version") == version:
                e["installed_at"] = now
                e["healthy"] = healthy
                e["disabled"] = disabled
                e["failed_count"] = 0
                break
        else:
            entries.append(
                {
                    "version": version,
                    "installed_at": now,
                    "healthy": healthy,
                    "disabled": disabled,
                    "failed_count": 0,
                }
            )
        idx["versions"] = entries
        self._write_index(idx)

    # ----- Rollback pointer --------------------------------------------------

    def _read_rollback(self) -> dict:
        if not self.rollback_path.is_file():
            return {}
        return json.loads(self.rollback_path.read_text(encoding="utf-8"))

    def _write_rollback(self, data: dict) -> None:
        _atomic_write_json(self.rollback_path, data)

    def get_rollback_target(self) -> str | None:
        data = self._read_rollback()
        val = data.get("previous_version")
        return val if isinstance(val, str) and val else None

    def _set_rollback_target(self, previous: str | None) -> None:
        data = self._read_rollback()
        if previous is None:
            data.pop("previous_version", None)
        else:
            data["previous_version"] = previous
        self._write_rollback(data)

    # ----- Current version ---------------------------------------------------

    def _current_slot(self) -> Path | None:
        if not self.current_link.exists() and not self.current_link.is_symlink():
            return None
        try:
            return self.current_link.resolve(strict=True)
        except FileNotFoundError:
            return None

    def get_current_version(self) -> str | None:
        slot = self._current_slot()
        if slot is None:
            return None
        version_file = slot / "VERSION.txt"
        if not version_file.is_file():
            return None
        return version_file.read_text(encoding="utf-8").strip() or None

    def _atomic_switch_current(self, target_slot: Path) -> None:
        """Atomically repoint app_root/current -> target_slot.

        Strategy: create a side-by-side temp directory link, then os.replace()
        it onto the canonical path. On Windows this must be a junction because
        ordinary users often cannot create directory symlinks.
        """
        target_slot = target_slot.resolve()
        tmp_link = self.current_link.with_name(self.current_link.name + ".tmp")
        _remove_path_link_or_dir(tmp_link)
        _create_dir_link(target_slot, tmp_link)
        # os.replace handles both "current doesn't exist" and "current already a symlink/dir"
        try:
            os.replace(tmp_link, self.current_link)
        except (IsADirectoryError, OSError):
            # `current` is a real directory (pre-v0.23 layout migration). Unlink+swap.
            _remove_path_link_or_dir(self.current_link)
            os.replace(tmp_link, self.current_link)

    # ----- Import / verify ---------------------------------------------------

    def verify_package(self, pkg_path: Path) -> Manifest:
        """Run the full validator without mutating the cache."""
        return validate_package(Path(pkg_path))

    def import_package(self, pkg_path: Path) -> ImportResult:
        pkg_path = Path(pkg_path)
        manifest = validate_package(pkg_path)  # raises ValidationError
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        cached = self.cache_dir / f"{manifest.package_id}.nova-update"
        shutil.copyfile(pkg_path, cached)
        return ImportResult(manifest=manifest, cached_path=cached)

    def _find_cached_package(self, package_id: str) -> Path:
        cached = self.cache_dir / f"{package_id}.nova-update"
        if not cached.is_file():
            raise UpdaterError(f"package not imported: {package_id}")
        return cached

    # ----- Install -----------------------------------------------------------

    def install(
        self,
        package_id: str,
        *,
        pre_hooks: bool = True,
        post_hooks: bool = True,
        backup_data: bool = True,
    ) -> InstallResult:
        """Extract the imported package into versions/<target>/ and swap current."""
        cached = self._find_cached_package(package_id)
        manifest = validate_package(cached)  # defence-in-depth

        current_version = self.get_current_version()

        # min_base_version gate
        if current_version is not None:
            if _semver_cmp(current_version, manifest.min_base_version) < 0:
                raise UpdaterError(
                    f"current version {current_version} is below "
                    f"min_base_version {manifest.min_base_version}"
                )

        target = manifest.target_version
        slot = self.versions_dir / target

        # 0. Pre-install backup of data/ — never blocks install if data/ doesn't exist
        if backup_data and (self.app_root / "data").is_dir():
            self.backup_data_dir(label=f"pre-install-{target}-{_now_iso_utc().replace(':', '')}")

        # 1. pre-install hook (M2 stub: just a no-op reservation)
        if pre_hooks:
            self._run_migration_stub("pre-install", manifest=manifest, slot=slot)

        # 2. Extract into a scratch slot, then rename (atomic-ish on same FS)
        scratch = self.versions_dir / f".{target}.scratch"
        if scratch.exists():
            shutil.rmtree(scratch)
        scratch.mkdir(parents=True)
        try:
            with zipfile.ZipFile(cached, "r") as zf:
                for name in zf.namelist():
                    if not name.startswith("payload/"):
                        continue
                    if name.endswith("/"):
                        continue
                    rel = name[len("payload/"):]
                    # refuse any traversal-looking entry (validator already
                    # rejected this but be defensive during extraction too)
                    if rel.startswith("/") or ".." in rel.split("/"):
                        raise UpdaterError(f"unsafe zip entry during install: {name}")
                    dest = scratch / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(name) as src, open(dest, "wb") as out:
                        shutil.copyfileobj(src, out)

            # Replace target slot with scratch
            if slot.exists():
                shutil.rmtree(slot)
            os.replace(scratch, slot)
        except Exception:
            # never leave scratch behind
            if scratch.exists():
                shutil.rmtree(scratch, ignore_errors=True)
            raise

        # 3. Update index
        self._upsert_index_entry(target, healthy=True, disabled=False)

        # 4. Record rollback pointer (previous current, if any and different)
        if current_version is not None and current_version != target:
            self._set_rollback_target(current_version)

        # 5. Swap the current symlink
        self._atomic_switch_current(slot)

        # 6. post-install hook
        if post_hooks:
            self._run_migration_stub("post-install", manifest=manifest, slot=slot)

        # 7. Retention
        self._prune_old_versions()

        return InstallResult(
            success=True, target_version=target, previous_version=current_version
        )

    def _run_migration_stub(
        self, phase: str, *, manifest: Manifest, slot: Path
    ) -> None:
        """Placeholder. Real Node child_process execution lives in M3."""
        # Intentionally empty; kept as a named seam so M3 can swap it in.
        return None

    # ----- Switch ------------------------------------------------------------

    def switch_to(self, version: str) -> SwitchResult:
        slot = self.versions_dir / version
        if not slot.is_dir() or not (slot / "VERSION.txt").is_file():
            raise UpdaterError(f"version not installed: {version}")

        current = self.get_current_version()
        if current == version:
            # No-op switch still counts as success but does not touch pointer
            return SwitchResult(success=True, from_version=current, to_version=version)

        if current is not None:
            self._set_rollback_target(current)

        self._atomic_switch_current(slot)
        return SwitchResult(success=True, from_version=current, to_version=version)

    # ----- List --------------------------------------------------------------

    def list_versions(self) -> list[InstalledVersion]:
        idx = self._read_index()
        current = self.get_current_version()
        out: list[InstalledVersion] = []
        for e in idx.get("versions", []):
            v = e.get("version")
            if not isinstance(v, str):
                continue
            out.append(
                InstalledVersion(
                    version=v,
                    installed_at=e.get("installed_at", ""),
                    is_current=(v == current),
                    healthy=bool(e.get("healthy", True)),
                    disabled=bool(e.get("disabled", False)),
                    failed_count=int(e.get("failed_count", 0)),
                )
            )
        # newest first, by installed_at
        out.sort(key=lambda x: x.installed_at, reverse=True)
        return out

    # ----- Retention ---------------------------------------------------------

    def _prune_old_versions(self) -> None:
        idx = self._read_index()
        entries: list[dict] = idx.get("versions", [])
        if len(entries) <= self.retention:
            return

        current = self.get_current_version()
        rollback = self.get_rollback_target()

        # Newest first; keep top self.retention entries, mandating current + rollback survive.
        # Tiebreak by semver because installed_at has second-level resolution.
        def _sort_key(e: dict) -> tuple:
            v = e.get("version", "0.0.0")
            try:
                sv = _parse_semver(v)
            except UpdaterError:
                sv = (0, 0, 0)
            return (e.get("installed_at", ""), sv)

        entries_sorted = sorted(entries, key=_sort_key, reverse=True)
        keep: list[dict] = []
        drop: list[dict] = []
        for e in entries_sorted:
            v = e.get("version")
            if v == current or v == rollback:
                keep.append(e)
                continue
            if len(keep) < self.retention:
                keep.append(e)
            else:
                drop.append(e)

        # If keep still > retention because current+rollback forced it, accept that
        # but still drop everything else beyond retention.
        for e in drop:
            v = e.get("version")
            if not isinstance(v, str):
                continue
            slot = self.versions_dir / v
            if slot.is_dir():
                shutil.rmtree(slot, ignore_errors=True)

        idx["versions"] = keep
        self._write_index(idx)

    # ----- M5 health tracking -------------------------------------------------

    def _find_index_entry(self, version: str) -> tuple[dict, list[dict]]:
        """Return (entry_dict, all_entries) or raise UpdaterError if missing."""
        idx = self._read_index()
        entries: list[dict] = idx.get("versions", [])
        for e in entries:
            if e.get("version") == version:
                return e, entries
        raise UpdaterError(f"version not in index: {version}")

    def mark_healthy(self, version: str) -> None:
        """Reset health bookkeeping for *version* after a successful startup."""
        entry, entries = self._find_index_entry(version)
        entry["healthy"] = True
        entry["disabled"] = False
        entry["failed_count"] = 0
        idx = self._read_index()
        idx["versions"] = entries
        self._write_index(idx)

    FAIL_BREAKER_THRESHOLD = 2

    def mark_failed(self, version: str, *, reason: str = "") -> FailureResult:
        """Increment the failure counter for *version*; trip breaker at threshold."""
        entry, entries = self._find_index_entry(version)
        entry["failed_count"] = int(entry.get("failed_count", 0)) + 1
        if entry["failed_count"] >= self.FAIL_BREAKER_THRESHOLD:
            entry["disabled"] = True
            entry["healthy"] = False
        idx = self._read_index()
        idx["versions"] = entries
        self._write_index(idx)

        # Also append to crash.log so the UI can surface the reason later
        if reason:
            self.record_crash(version, reason=reason)

        return FailureResult(
            version=version,
            failed_count=entry["failed_count"],
            disabled=bool(entry.get("disabled", False)),
        )

    # ----- M5 crash log -------------------------------------------------------

    def record_crash(self, version: str, *, reason: str) -> None:
        """Append a JSONL line to data/logs/crash.log.

        We treat data/ as inviolable for *content*, but data/logs/ is the
        canonical place for this kind of operational telemetry; we never write
        anywhere else under data/.
        """
        log_dir = self.app_root / "data" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / "crash.log"
        entry = {
            "timestamp": _now_iso_utc(),
            "version": version,
            "reason": reason,
        }
        line = json.dumps(entry, ensure_ascii=False)
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    # ----- M5 auto rollback ---------------------------------------------------

    def auto_rollback_if_needed(self) -> AutoRollbackResult:
        """If current version is disabled and a rollback target exists, switch."""
        current = self.get_current_version()
        if current is None:
            return AutoRollbackResult(rolled_back=False, from_version=None, to_version=None)

        try:
            entry, _ = self._find_index_entry(current)
        except UpdaterError:
            return AutoRollbackResult(rolled_back=False, from_version=current, to_version=None)

        if not entry.get("disabled"):
            return AutoRollbackResult(rolled_back=False, from_version=current, to_version=None)

        target = self.get_rollback_target()
        if not target or target == current:
            return AutoRollbackResult(rolled_back=False, from_version=current, to_version=None)

        slot = self.versions_dir / target
        if not slot.is_dir():
            return AutoRollbackResult(rolled_back=False, from_version=current, to_version=None)

        self.switch_to(target)
        return AutoRollbackResult(rolled_back=True, from_version=current, to_version=target)

    # ----- M5 backup ----------------------------------------------------------

    def backup_data_dir(self, *, label: str) -> Path:
        """Snapshot app_root/data/ to app_root/cache/backups/<label>/.

        We only ever read app_root/data/, so cache/, versions/, current, and
        rollback_pointer.json cannot be inadvertently included.
        """
        if not label or "/" in label or ".." in label:
            raise UpdaterError(f"invalid backup label: {label!r}")
        data_dir = self.app_root / "data"
        if not data_dir.is_dir():
            raise UpdaterError(f"no data/ to back up at {data_dir}")
        backups_dir = self.app_root / "cache" / "backups"
        backups_dir.mkdir(parents=True, exist_ok=True)
        dst = backups_dir / label
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(data_dir, dst)
        return dst
