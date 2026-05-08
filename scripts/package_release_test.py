from pathlib import Path


SCRIPT = Path(__file__).with_name("package_release.ps1")
BAT = SCRIPT.parent.parent / "一键打包更新包.bat"
ASCII_BAT = SCRIPT.parent.parent / "package_release.bat"
DOC = SCRIPT.with_name("PACKAGE_RELEASE.md")


def test_package_release_script_exists():
    assert SCRIPT.is_file()


def test_package_release_has_diagnostic_failure_helpers():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "function Fail-Stage" in text
    assert "function Invoke-LoggedCommand" in text
    assert "function Test-ForbiddenPayloadContent" in text
    assert "function Copy-ElectronProductionDeps" in text
    assert "logs\\package-release" in text


def test_package_release_rejects_runtime_state_directories():
    text = SCRIPT.read_text(encoding="utf-8")

    for forbidden in ("data", "cache", "current", "versions", "electron\\runtime"):
        assert forbidden in text


def test_package_release_supports_signed_and_unsigned_dev_modes():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "UnsignedDevPackage" in text
    assert "--no-validate" in text
    assert "--sign-key" in text
    assert "--signing-key-id" in text
    assert "PublicBaseUrl" in text


def test_package_release_uses_non_minified_bundle_markers():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "updater:verify" in text
    assert "revisions" in text


def test_package_release_stages_electron_runtime_dependencies():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Stage electron dependencies" in text
    assert "electron\\node_modules\\chokidar\\package.json" in text
    assert "electron\\node_modules\\yaml\\package.json" in text


def test_batch_wrapper_supports_signed_release_arguments():
    text = ASCII_BAT.read_text(encoding="utf-8")

    assert "SIGN_KEY" in text
    assert "SIGNING_KEY_ID" in text
    assert "-SignKey" in text
    assert "-SigningKeyId" in text
    assert "dev" in text.lower()
    assert "-UnsignedDevPackage -NoVersionBump" in text
    assert "PUBLIC_BASE_URL" in text


def test_batch_wrapper_defaults_to_pinned_local_release_key():
    text = ASCII_BAT.read_text(encoding="utf-8")

    assert "dist\\keys\\nova-release-2026-05.pem" in text
    assert "nova-release-2026-05" in text
    assert "Using bundled local release signing key" in text


def test_chinese_batch_wrapper_delegates_to_ascii_entrypoint():
    text = BAT.read_text(encoding="utf-8")

    assert "package_release.bat" in text


def test_release_packaging_docs_cover_failure_diagnostics_and_update_flow():
    text = DOC.read_text(encoding="utf-8")

    assert "设置 -> 更新" in text
    assert "失败排查" in text
    assert "logs\\package-release" in text
    assert "dist\\keys\\nova-release-2026-05.pem" in text
    assert "updater-install-failures.log" in text
    assert "自动回到上一个稳定版本" in text
    assert "cache/" in text
    assert "current/" in text
    assert "versions/" in text


def test_package_release_writes_json_without_utf8_bom():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Write-Utf8NoBom" in text
    assert "Set-Content -LiteralPath $pkgJsonPath -Encoding UTF8" not in text


def test_package_release_version_bump_is_idempotent():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Package.json already at $Version" in text
    assert "$pkgJson.version -ne $Version" in text


def test_package_release_writes_latest_update_feed():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "function Write-ReleaseFeed" in text
    assert "latest.json" in text
    assert "package_sha256" in text
    assert "package_size_bytes" in text
    assert "package_url" in text
