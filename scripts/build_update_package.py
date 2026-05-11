"""CLI: build a `.nova-update` package from a source directory tree.

Usage:
    python scripts/build_update_package.py \
        --source delivery/v0.22.0 \
        --release-notes delivery/v0.22.0/CHANGELOG_v0.22.0.md \
        --output delivery/nova-v0.22.0-full.nova-update \
        [--min-base-version 0.21.0] \
        [--channel stable|beta|dev] \
        [--flavor full] \
        [--released-at 2026-05-04T00:00:00Z]

Exit codes (per docs/updater/package-format.md §6):
    0 success
    2 argument error
    3 invalid source dir
    4 internal packaging error
"""
from __future__ import annotations

import argparse
import datetime as _dt
import sys
from pathlib import Path

# Allow running as `python scripts/build_update_package.py` from repo root.
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.services.updater_pkg import (  # noqa: E402
    PackageError,
    SignatureError,
    ValidationError,
    build_package,
    validate_package,
)
from backend.services import updater_keys  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: E402
    Ed25519PrivateKey,
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="build_update_package",
        description="Build a Nova .nova-update package (schema v1).",
    )
    p.add_argument("--source", required=True, help="Source directory containing VERSION.txt + payload tree")
    p.add_argument("--output", required=True, help="Output .nova-update file path")
    p.add_argument("--release-notes", required=True, help="Path to Markdown release notes (will be embedded)")
    p.add_argument("--min-base-version", default=None, help="semver; default = <major>.<minor-1>.0")
    p.add_argument("--channel", default="stable", choices=["stable", "beta", "dev"])
    p.add_argument("--flavor", default="full", help="package_id suffix, default 'full'")
    p.add_argument("--released-at", default=None, help="UTC ISO 8601, e.g. 2026-05-04T00:00:00Z")
    p.add_argument("--no-validate", action="store_true", help="Skip validate_package() roundtrip check")
    p.add_argument(
        "--sign-key",
        default=None,
        help="Path to PEM ed25519 private key (v0.23.1+ signed packages). "
        "If omitted, builds an UNSIGNED package which v0.23.1 validators will reject.",
    )
    p.add_argument(
        "--signing-key-id",
        default=None,
        help="signing_key_id embedded in manifest envelope. Required with --sign-key. "
        "Must already be registered in backend/services/updater_keys.py::TRUSTED_KEYS.",
    )
    return p.parse_args(argv)


def _load_release_notes(path: Path) -> str:
    if not path.is_file():
        raise PackageError(f"release notes file does not exist: {path}")
    return path.read_text(encoding="utf-8")


def _default_released_at() -> str:
    now = _dt.datetime.now(tz=_dt.timezone.utc).replace(microsecond=0)
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: list[str] | None = None) -> int:
    try:
        args = _parse_args(argv)
    except SystemExit as e:
        # argparse already printed an error; classify as arg error
        return 2 if e.code != 0 else 0

    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    notes_path = Path(args.release_notes).resolve()
    released_at = args.released_at or _default_released_at()

    # 1. Source dir validation (exit 3)
    if not source.is_dir():
        print(f"error: --source is not a directory: {source}", file=sys.stderr)
        return 3
    if not (source / "VERSION.txt").is_file():
        print(f"error: VERSION.txt missing in source: {source}", file=sys.stderr)
        return 3

    # 2. Release notes
    try:
        release_notes_md = _load_release_notes(notes_path)
    except PackageError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    # 2b. Signing key (optional but strongly recommended for v0.23.1+)
    sign_key: Ed25519PrivateKey | None = None
    signing_key_id: str | None = None
    if args.sign_key or args.signing_key_id:
        if not (args.sign_key and args.signing_key_id):
            print(
                "error: --sign-key and --signing-key-id must be passed together",
                file=sys.stderr,
            )
            return 2
        key_path = Path(args.sign_key).expanduser().resolve()
        if not key_path.is_file():
            print(f"error: --sign-key path does not exist: {key_path}", file=sys.stderr)
            return 2
        try:
            loaded = serialization.load_pem_private_key(
                key_path.read_bytes(), password=None
            )
        except Exception as exc:  # noqa: BLE001
            print(f"error: could not load --sign-key: {exc}", file=sys.stderr)
            return 2
        if not isinstance(loaded, Ed25519PrivateKey):
            print("error: --sign-key is not an ed25519 private key", file=sys.stderr)
            return 2
        if args.signing_key_id not in updater_keys.TRUSTED_KEYS:
            print(
                f"error: --signing-key-id {args.signing_key_id!r} is not pinned in "
                f"backend/services/updater_keys.py::TRUSTED_KEYS",
                file=sys.stderr,
            )
            return 2
        # Cross-check: public key derived from --sign-key must equal the pinned one.
        derived_pub = loaded.public_key().public_bytes_raw()
        pinned_pub = updater_keys.TRUSTED_KEYS[args.signing_key_id]
        if derived_pub != pinned_pub:
            print(
                "error: public key derived from --sign-key does not match the pinned "
                "TRUSTED_KEYS entry for --signing-key-id. Wrong key file?",
                file=sys.stderr,
            )
            return 2
        sign_key = loaded
        signing_key_id = args.signing_key_id

    # 3. Build
    try:
        manifest = build_package(
            source_dir=source,
            output_path=output,
            release_notes_md=release_notes_md,
            min_base_version=args.min_base_version,
            channel=args.channel,
            released_at=released_at,
            flavor=args.flavor,
            sign_key=sign_key,
            signing_key_id=signing_key_id,
        )
    except PackageError as exc:
        # Bad input / structure -> 3
        print(f"error: {exc}", file=sys.stderr)
        return 3
    except Exception as exc:  # noqa: BLE001
        print(f"internal packaging error: {exc}", file=sys.stderr)
        return 4

    # 4. Roundtrip validate
    if not args.no_validate:
        try:
            validate_package(output)
        except SignatureError as exc:
            print(
                f"post-build signature check failed: {exc}\n"
                "  hint: did you forget --sign-key / --signing-key-id?",
                file=sys.stderr,
            )
            return 4
        except ValidationError as exc:
            print(f"post-build validation failed: {exc}", file=sys.stderr)
            return 4

    signed_banner = (
        f"  signed_by         = {signing_key_id}" if signing_key_id else
        "  signed_by         = (unsigned — v0.23.1 clients will REJECT this package)"
    )
    size_mb = output.stat().st_size / (1024 * 1024)
    print(
        f"built {output.name}\n"
        f"  target_version    = {manifest.target_version}\n"
        f"  min_base_version  = {manifest.min_base_version}\n"
        f"  release_channel   = {manifest.release_channel}\n"
        f"  files             = {len(manifest.files)}\n"
        f"  payload bytes     = {manifest.size_bytes}\n"
        f"  package size      = {size_mb:.2f} MiB\n"
        f"  restart_required  = {manifest.restart_required}\n"
        f"  electron_restart  = {manifest.requires_electron_restart}\n"
        f"{signed_banner}\n"
        f"  output            = {output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
