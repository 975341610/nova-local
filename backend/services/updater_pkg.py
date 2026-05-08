"""Nova `.nova-update` package core library (schema v1).

Reference: docs/updater/package-format.md

Public surface used by tests (and by CLI / UpdaterService later):

- `compute_sha256(path)`                    -> lowercase hex digest
- `scan_payload(payload_dir)`               -> list[FileEntry]
- `build_manifest(...)`                     -> Manifest
- `validate_manifest_schema(raw_dict)`      -> None (raises ValidationError)
- `validate_package(zip_path)`              -> Manifest
- `build_package(source_dir, output_path, ...)` -> Manifest

Exceptions:
- `PackageError`     — builder-side problem (bad source tree, IO failure)
- `ValidationError`  — validator-side problem (schema / hash / zip violation)
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Optional, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
    )


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class PackageError(Exception):
    """Raised while *building* a package (bad input tree, IO error, ...)."""


class ValidationError(Exception):
    """Raised while *validating* a package or a manifest."""


class SignatureError(ValidationError):
    """Raised when a package fails ed25519 signature verification.

    Subclasses `ValidationError` so existing ``except ValidationError`` call
    sites (UpdaterService.verify_package, updater_cli) still catch signature
    failures without code changes. Callers that want to distinguish "bad
    signature" from "bad schema" can catch this subclass specifically.
    """


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FileEntry:
    path: str
    sha256: str
    size: int

    def to_dict(self) -> dict:
        return {"path": self.path, "sha256": self.sha256, "size": self.size}


@dataclass
class Manifest:
    schema_version: int
    package_id: str
    target_version: str
    min_base_version: str
    release_channel: str
    released_at: str
    release_notes_md: str
    size_bytes: int
    restart_required: bool
    requires_electron_restart: bool
    files: list[FileEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "package_id": self.package_id,
            "target_version": self.target_version,
            "min_base_version": self.min_base_version,
            "release_channel": self.release_channel,
            "released_at": self.released_at,
            "release_notes_md": self.release_notes_md,
            "size_bytes": self.size_bytes,
            "restart_required": self.restart_required,
            "requires_electron_restart": self.requires_electron_restart,
            "files": [f.to_dict() for f in self.files],
        }


# ---------------------------------------------------------------------------
# Regex constants
# ---------------------------------------------------------------------------


_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
_PACKAGE_ID_RE = re.compile(r"^nova-v\d+\.\d+\.\d+(?:-[\w.]+)?-[a-z]+$")
_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_CHUNK = 64 * 1024


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def compute_sha256(path: Path) -> str:
    """Return lowercase hex SHA-256 of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(_CHUNK)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _is_safe_payload_path(rel: str) -> bool:
    if not rel:
        return False
    if rel.startswith("/"):
        return False
    if "\\" in rel:
        return False
    parts = rel.split("/")
    for p in parts:
        if not p or p == "." or p == "..":
            return False
    return True


def _is_semver(s: str) -> bool:
    return isinstance(s, str) and bool(_SEMVER_RE.match(s))


# ---------------------------------------------------------------------------
# Signature helpers (ed25519 over canonical manifest JSON)
# ---------------------------------------------------------------------------


def _canonical_manifest_bytes(manifest: dict) -> bytes:
    """Deterministic JSON serialization of the inner manifest for signing.

    Sorted keys + tight separators -> same bytes regardless of dict ordering
    or whitespace. Both signer (build_package / updater_sign CLI) and verifier
    (validate_package) MUST use this exact serialization.
    """
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _verify_signature(envelope: dict) -> None:
    """Validate the envelope's ed25519 signature; raise SignatureError on any
    deviation from "well-formed envelope signed by a trusted key"."""
    if not isinstance(envelope, dict):
        raise SignatureError("manifest envelope must be a JSON object")
    if "manifest" not in envelope or not isinstance(envelope["manifest"], dict):
        raise SignatureError("envelope is missing inner 'manifest'")
    if "signature" not in envelope or not isinstance(envelope["signature"], str):
        raise SignatureError("envelope is missing 'signature'")
    if "signing_key_id" not in envelope or not isinstance(
        envelope["signing_key_id"], str
    ):
        raise SignatureError("envelope is missing 'signing_key_id'")

    from backend.services.updater_keys import TRUSTED_KEYS

    key_id = envelope["signing_key_id"]
    pub_raw = TRUSTED_KEYS.get(key_id)
    if pub_raw is None:
        raise SignatureError(f"signing_key_id is not trusted: {key_id!r}")

    try:
        sig = base64.b64decode(envelope["signature"], validate=True)
    except (ValueError, TypeError) as exc:
        raise SignatureError(f"signature is not valid base64: {exc}") from exc
    if len(sig) != 64:
        raise SignatureError(
            f"ed25519 signature must be 64 bytes, got {len(sig)}"
        )

    canonical = _canonical_manifest_bytes(envelope["manifest"])
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PublicKey,
        )

        Ed25519PublicKey.from_public_bytes(pub_raw).verify(sig, canonical)
    except InvalidSignature as exc:
        raise SignatureError("ed25519 signature did not verify") from exc
    except Exception as exc:  # noqa: BLE001
        raise SignatureError(f"signature verification crashed: {exc}") from exc


def _sign_manifest(manifest_dict: dict, sign_key) -> bytes:
    """Return raw 64-byte ed25519 signature over canonical manifest bytes."""
    return sign_key.sign(_canonical_manifest_bytes(manifest_dict))


def _make_envelope(
    manifest_dict: dict,
    sign_key=None,
    signing_key_id: str | None = None,
) -> dict:
    """Wrap a manifest dict into the v0.23.1 signed envelope. If `sign_key`
    is None we still emit the envelope shape but with an empty signature so
    `validate_package` (strict mode) will reject it — this keeps the on-disk
    layout uniform across signed and unsigned builds."""
    envelope = {
        "manifest": manifest_dict,
        "signature": "",
        "signing_key_id": signing_key_id or "",
    }
    if sign_key is not None:
        envelope["signature"] = base64.b64encode(
            _sign_manifest(manifest_dict, sign_key)
        ).decode("ascii")
    return envelope


# ---------------------------------------------------------------------------
# scan_payload
# ---------------------------------------------------------------------------


def scan_payload(payload_dir: Path) -> list[FileEntry]:
    """Walk payload_dir and produce sorted FileEntry list with SHA-256 + size."""
    payload_dir = Path(payload_dir)
    if not payload_dir.is_dir():
        raise PackageError(f"payload dir does not exist: {payload_dir}")

    entries: list[FileEntry] = []
    for root, _dirs, files in os.walk(payload_dir):
        for name in files:
            abs_path = Path(root) / name
            if not abs_path.is_file():
                continue
            rel = abs_path.relative_to(payload_dir).as_posix()
            entries.append(
                FileEntry(
                    path=rel,
                    sha256=compute_sha256(abs_path),
                    size=abs_path.stat().st_size,
                )
            )
    entries.sort(key=lambda e: e.path)
    return entries


# ---------------------------------------------------------------------------
# build_manifest
# ---------------------------------------------------------------------------


def _default_min_base_version(target_version: str) -> str:
    """Drop to <major>.<minor-1>.0 (clamped at 0)."""
    if not _is_semver(target_version):
        raise PackageError(f"target_version is not semver: {target_version}")
    core = target_version.split("-", 1)[0]
    major_s, minor_s, _patch_s = core.split(".")
    major, minor = int(major_s), int(minor_s)
    if minor > 0:
        minor -= 1
    elif major > 0:
        major -= 1
        minor = 0
    else:
        minor = 0
    return f"{major}.{minor}.0"


def build_manifest(
    *,
    payload_dir: Path,
    target_version: str,
    min_base_version: str,
    release_channel: str,
    release_notes_md: str,
    released_at: str | None = None,
    package_id: str | None = None,
    flavor: str = "full",
) -> Manifest:
    payload_dir = Path(payload_dir)
    files = scan_payload(payload_dir)
    if not files:
        raise PackageError("payload is empty")

    size_bytes = sum(f.size for f in files)

    # restart flags are inferred from what's actually in payload
    paths = [f.path for f in files]
    touches_electron = any(
        p == "electron" or p.startswith("electron/") for p in paths
    )
    touches_frontend = any(
        p == "frontend_dist" or p.startswith("frontend_dist/") for p in paths
    )
    requires_electron_restart = touches_electron
    restart_required = touches_electron or touches_frontend

    if released_at is None:
        # deterministic default — no wall clock in build; caller should supply if matters
        released_at = "1970-01-01T00:00:00Z"

    if package_id is None:
        package_id = f"nova-v{target_version}-{flavor}"

    return Manifest(
        schema_version=1,
        package_id=package_id,
        target_version=target_version,
        min_base_version=min_base_version,
        release_channel=release_channel,
        released_at=released_at,
        release_notes_md=release_notes_md,
        size_bytes=size_bytes,
        restart_required=restart_required,
        requires_electron_restart=requires_electron_restart,
        files=files,
    )


# ---------------------------------------------------------------------------
# Manifest schema validation
# ---------------------------------------------------------------------------


_REQUIRED_FIELDS = {
    "schema_version": int,
    "package_id": str,
    "target_version": str,
    "min_base_version": str,
    "release_channel": str,
    "released_at": str,
    "release_notes_md": str,
    "size_bytes": int,
    "restart_required": bool,
    "requires_electron_restart": bool,
    "files": list,
}


def validate_manifest_schema(data: dict) -> None:
    if not isinstance(data, dict):
        raise ValidationError("manifest must be a JSON object")

    # Required keys + types
    for key, typ in _REQUIRED_FIELDS.items():
        if key not in data:
            raise ValidationError(f"missing required field: {key}")
        value = data[key]
        # bool is subclass of int — guard against int where bool expected and vice versa
        if typ is bool and not isinstance(value, bool):
            raise ValidationError(f"field {key} must be bool")
        if typ is int and (isinstance(value, bool) or not isinstance(value, int)):
            raise ValidationError(f"field {key} must be int")
        if typ is not bool and typ is not int and not isinstance(value, typ):
            raise ValidationError(f"field {key} must be {typ.__name__}")

    if data["schema_version"] != 1:
        raise ValidationError("schema_version must be 1")

    if not _PACKAGE_ID_RE.match(data["package_id"]):
        raise ValidationError(f"invalid package_id: {data['package_id']}")

    if not _is_semver(data["target_version"]):
        raise ValidationError(f"invalid target_version: {data['target_version']}")

    if not _is_semver(data["min_base_version"]):
        raise ValidationError(f"invalid min_base_version: {data['min_base_version']}")

    if data["release_channel"] not in {"stable", "beta", "dev"}:
        raise ValidationError(f"invalid release_channel: {data['release_channel']}")

    if not _TIMESTAMP_RE.match(data["released_at"]):
        raise ValidationError(f"invalid released_at: {data['released_at']}")

    if data["size_bytes"] < 0:
        raise ValidationError("size_bytes must be >= 0")

    if data["requires_electron_restart"] and not data["restart_required"]:
        raise ValidationError(
            "requires_electron_restart=True requires restart_required=True"
        )

    files = data["files"]
    if not files:
        raise ValidationError("files must not be empty")

    seen_paths: set[str] = set()
    total = 0
    for idx, entry in enumerate(files):
        if not isinstance(entry, dict):
            raise ValidationError(f"files[{idx}] must be an object")
        for k in ("path", "sha256", "size"):
            if k not in entry:
                raise ValidationError(f"files[{idx}] missing {k}")
        if not isinstance(entry["path"], str) or not _is_safe_payload_path(
            entry["path"]
        ):
            raise ValidationError(f"files[{idx}] has unsafe path: {entry['path']!r}")
        if entry["path"] in seen_paths:
            raise ValidationError(f"duplicated file path: {entry['path']}")
        seen_paths.add(entry["path"])
        if not isinstance(entry["sha256"], str) or not _SHA256_RE.match(
            entry["sha256"]
        ):
            raise ValidationError(f"files[{idx}] has invalid sha256")
        if (
            isinstance(entry["size"], bool)
            or not isinstance(entry["size"], int)
            or entry["size"] < 0
        ):
            raise ValidationError(f"files[{idx}] has invalid size")
        total += entry["size"]

    if total != data["size_bytes"]:
        raise ValidationError(
            f"size_bytes ({data['size_bytes']}) != sum(files[].size) ({total})"
        )


def _manifest_from_dict(data: dict) -> Manifest:
    return Manifest(
        schema_version=data["schema_version"],
        package_id=data["package_id"],
        target_version=data["target_version"],
        min_base_version=data["min_base_version"],
        release_channel=data["release_channel"],
        released_at=data["released_at"],
        release_notes_md=data["release_notes_md"],
        size_bytes=data["size_bytes"],
        restart_required=data["restart_required"],
        requires_electron_restart=data["requires_electron_restart"],
        files=[
            FileEntry(path=e["path"], sha256=e["sha256"], size=e["size"])
            for e in data["files"]
        ],
    )


# ---------------------------------------------------------------------------
# validate_package
# ---------------------------------------------------------------------------


def validate_package(zip_path: Path) -> Manifest:
    zip_path = Path(zip_path)
    if not zip_path.is_file():
        raise ValidationError(f"package not found: {zip_path}")

    try:
        zf = zipfile.ZipFile(zip_path, "r")
    except zipfile.BadZipFile as exc:
        raise ValidationError(f"not a valid zip: {exc}") from exc

    with zf:
        # 1. ZIP integrity
        first_bad = zf.testzip()
        if first_bad is not None:
            raise ValidationError(f"zip integrity check failed on: {first_bad}")

        names = zf.namelist()

        # Guard against traversal / absolute paths in zip entries themselves
        for n in names:
            # drop directory entries (trailing slash)
            if n.endswith("/"):
                continue
            # Reject absolute, backslashes, ..
            if n.startswith("/") or "\\" in n:
                raise ValidationError(f"unsafe zip entry: {n!r}")
            parts = n.split("/")
            if any(p in ("", ".", "..") for p in parts):
                raise ValidationError(f"unsafe zip entry: {n!r}")

        # 2. manifest.json present
        if "manifest.json" not in names:
            raise ValidationError("manifest.json is missing")

        # 3. parse envelope: { manifest, signature, signing_key_id }
        try:
            manifest_bytes = zf.read("manifest.json")
            envelope = json.loads(manifest_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError(f"manifest.json is not valid UTF-8 JSON: {exc}") from exc

        # 3a. envelope must be present and signature must verify before we
        #     trust any of the inner manifest fields.
        _verify_signature(envelope)
        manifest_data = envelope["manifest"]

        # 4-6. schema / regex / semver
        validate_manifest_schema(manifest_data)
        manifest = _manifest_from_dict(manifest_data)

        # Build set of payload files actually present
        actual_payload: dict[str, bytes] = {}
        for name in names:
            if name.endswith("/"):
                continue
            if not name.startswith("payload/"):
                continue
            rel = name[len("payload/"):]
            if not _is_safe_payload_path(rel):
                raise ValidationError(f"unsafe payload path: {rel!r}")
            actual_payload[rel] = zf.read(name)

        # 7. VERSION.txt presence + equality with target_version
        if "VERSION.txt" not in actual_payload:
            raise ValidationError("payload/VERSION.txt is missing")
        version_text = actual_payload["VERSION.txt"].decode("utf-8", errors="replace").strip()
        if version_text != manifest.target_version:
            raise ValidationError(
                f"VERSION.txt ({version_text!r}) != target_version "
                f"({manifest.target_version!r})"
            )

        # 8. payload ↔ manifest.files set equality
        manifest_paths = {f.path for f in manifest.files}
        payload_paths = set(actual_payload.keys())
        if manifest_paths != payload_paths:
            missing_in_payload = manifest_paths - payload_paths
            extra_in_payload = payload_paths - manifest_paths
            raise ValidationError(
                "payload/manifest mismatch "
                f"(missing in payload: {sorted(missing_in_payload)}, "
                f"extra in payload: {sorted(extra_in_payload)})"
            )

        # 9. hash + size match actual file bytes
        actual_total = 0
        for entry in manifest.files:
            data = actual_payload[entry.path]
            actual_size = len(data)
            if actual_size != entry.size:
                raise ValidationError(
                    f"size mismatch for {entry.path}: "
                    f"manifest={entry.size} actual={actual_size}"
                )
            digest = _sha256_bytes(data)
            if digest != entry.sha256:
                raise ValidationError(
                    f"sha256 mismatch for {entry.path}: "
                    f"manifest={entry.sha256} actual={digest}"
                )
            actual_total += actual_size

        # 10. size_bytes equals actual sum too
        if actual_total != manifest.size_bytes:
            raise ValidationError(
                f"size_bytes ({manifest.size_bytes}) != actual sum ({actual_total})"
            )

        # 11. signature: out of scope for v1 (optional, v0.23.1+)

    return manifest


# ---------------------------------------------------------------------------
# build_package
# ---------------------------------------------------------------------------


def build_package(
    *,
    source_dir: Path,
    output_path: Path,
    release_notes_md: str,
    min_base_version: str | None,
    channel: str,
    released_at: str | None = None,
    flavor: str = "full",
    sign_key: "Ed25519PrivateKey | None" = None,
    signing_key_id: str | None = None,
) -> Manifest:
    source_dir = Path(source_dir)
    output_path = Path(output_path)

    if not source_dir.is_dir():
        raise PackageError(f"source directory does not exist: {source_dir}")

    version_file = source_dir / "VERSION.txt"
    if not version_file.is_file():
        raise PackageError(f"VERSION.txt missing in source: {version_file}")

    target_version = version_file.read_text(encoding="utf-8").strip()
    if not _is_semver(target_version):
        raise PackageError(f"VERSION.txt content is not semver: {target_version!r}")

    if min_base_version is None:
        min_base_version = _default_min_base_version(target_version)
    elif not _is_semver(min_base_version):
        raise PackageError(f"min_base_version is not semver: {min_base_version}")

    if channel not in {"stable", "beta", "dev"}:
        raise PackageError(f"invalid channel: {channel}")

    manifest = build_manifest(
        payload_dir=source_dir,
        target_version=target_version,
        min_base_version=min_base_version,
        release_channel=channel,
        release_notes_md=release_notes_md,
        released_at=released_at,
        flavor=flavor,
    )

    # Sanity: run schema validator on our own output — catches bugs early.
    validate_manifest_schema(manifest.to_dict())

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    if tmp_path.exists():
        tmp_path.unlink()

    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_STORED) as zf:
            envelope = _make_envelope(
                manifest.to_dict(),
                sign_key=sign_key,
                signing_key_id=signing_key_id,
            )
            manifest_json = json.dumps(
                envelope, ensure_ascii=False, indent=2
            ).encode("utf-8")
            zf.writestr("manifest.json", manifest_json)
            for entry in manifest.files:
                abs_path = source_dir / entry.path
                zf.write(abs_path, arcname=f"payload/{entry.path}")
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise

    os.replace(tmp_path, output_path)
    return manifest
