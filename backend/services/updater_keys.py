"""Pinned ed25519 public keys trusted to sign Nova `.nova-update` packages.

Maps `signing_key_id` -> 32-byte raw ed25519 public key. New keys are
introduced in lock-step with a Nova release; old keys remain trusted for at
least one major version after their successor is published, so a user
upgrading across the rotation window doesn't get stranded.

The corresponding **private** keys live exclusively in the release pipeline's
secret store. Compromise of any private key invalidates all packages signed
under that `signing_key_id`; rotate by adding a new key id alongside the old.
"""
from __future__ import annotations


# fmt: off
TRUSTED_KEYS: dict[str, bytes] = {
    # v0.23.1 initial release key. Private key lives in release pipeline only;
    # see dist/keys/ (gitignored) + RELEASE_NOTES_v0.23.1.md for rotation policy.
    "nova-release-2026-05": bytes.fromhex(
        "66551262d925a6aaaaf08b1c59f10aa03ba44f0545d36e66fe2e403273cce897"
    ),
}
# fmt: on
