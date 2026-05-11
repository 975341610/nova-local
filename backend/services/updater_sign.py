"""`backend.services.updater_sign` — release-side signing tool.

Two subcommands:

* ``gen-key  --out PATH``        Generate an ed25519 keypair. Writes the
  private key as a PKCS#8 unencrypted PEM to PATH and prints the raw 32-byte
  public key as ``public_key_hex=...`` on stdout (paste into
  ``backend/services/updater_keys.py::TRUSTED_KEYS``).
* ``sign     --in PKG --key PEM --key-id ID``   Take an unsigned (or
  re-sign an already-signed) ``.nova-update`` package and rewrite its
  ``manifest.json`` envelope with a fresh ed25519 signature. The package
  itself is mutated in-place (atomic via tmp-rename).

The signing pipeline lives outside the running Nova process so the private
key never touches end-user machines.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)

from backend.services.updater_pkg import (
    PackageError,
    _canonical_manifest_bytes,
    _make_envelope,
)


def _cmd_gen_key(args: argparse.Namespace) -> int:
    out_path = Path(args.out)
    if out_path.exists() and not args.force:
        sys.stderr.write(
            f"refusing to overwrite existing key: {out_path} (use --force)\n"
        )
        return 1

    priv = Ed25519PrivateKey.generate()
    pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(pem)
    try:
        os.chmod(out_path, 0o600)
    except OSError:
        # best-effort on platforms that don't honor POSIX modes
        pass

    pub_hex = priv.public_key().public_bytes_raw().hex()
    sys.stdout.write(f"public_key_hex={pub_hex}\n")
    return 0


def _cmd_sign(args: argparse.Namespace) -> int:
    pkg_path = Path(args.in_path)
    key_path = Path(args.key)
    if not pkg_path.is_file():
        sys.stderr.write(f"package not found: {pkg_path}\n")
        return 1
    if not key_path.is_file():
        sys.stderr.write(f"private key not found: {key_path}\n")
        return 1

    priv = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    if not isinstance(priv, Ed25519PrivateKey):
        sys.stderr.write("loaded key is not ed25519\n")
        return 1

    # Read everything (we need to rewrite manifest.json in place).
    with zipfile.ZipFile(pkg_path, "r") as zf:
        names = zf.namelist()
        if "manifest.json" not in names:
            raise PackageError("manifest.json missing — not a Nova update package")
        existing = json.loads(zf.read("manifest.json").decode("utf-8"))
        payload_entries = {n: zf.read(n) for n in names if n != "manifest.json"}

    # Accept either a v1 raw manifest dict (legacy unsigned build) OR an
    # already-existing envelope. In both cases we strip down to the inner
    # manifest then re-wrap.
    if "manifest" in existing and isinstance(existing["manifest"], dict):
        inner = existing["manifest"]
    else:
        inner = existing

    envelope = _make_envelope(
        inner, sign_key=priv, signing_key_id=args.key_id
    )

    tmp_path = pkg_path.with_suffix(pkg_path.suffix + ".tmp")
    if tmp_path.exists():
        tmp_path.unlink()
    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_STORED) as zf:
            zf.writestr(
                "manifest.json",
                json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8"),
            )
            for n, data in payload_entries.items():
                zf.writestr(n, data)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise
    os.replace(tmp_path, pkg_path)

    sig_b64 = envelope["signature"]
    sys.stdout.write(
        f"signed: {pkg_path} key_id={args.key_id} signature={sig_b64[:16]}...\n"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="updater_sign")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_gen = sub.add_parser("gen-key", help="generate an ed25519 keypair")
    p_gen.add_argument("--out", required=True, help="path to write PEM private key")
    p_gen.add_argument("--force", action="store_true", help="overwrite existing key")
    p_gen.set_defaults(func=_cmd_gen_key)

    p_sign = sub.add_parser("sign", help="sign or re-sign a .nova-update package")
    p_sign.add_argument("--in", dest="in_path", required=True, help="package path")
    p_sign.add_argument("--key", required=True, help="PEM private key")
    p_sign.add_argument("--key-id", required=True, help="signing_key_id in manifest")
    p_sign.set_defaults(func=_cmd_sign)

    ns = parser.parse_args(argv)
    return int(ns.func(ns) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
