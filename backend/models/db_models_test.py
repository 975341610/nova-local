import base64

from backend.models.db_models import deobfuscate, obfuscate


def test_model_config_secret_round_trips_with_versioned_prefix():
    secret = "sk-versioned-secret-1234"

    stored = obfuscate(secret)

    assert stored.startswith(("dpapi:v1:", "local:v1:"))
    assert deobfuscate(stored) == secret


def test_deobfuscate_does_not_decode_unversioned_base64_fallback():
    legacy_encoded = base64.b64encode(b"sk-legacy-secret").decode("utf-8")

    assert deobfuscate(legacy_encoded) == legacy_encoded
