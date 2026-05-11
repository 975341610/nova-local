import subprocess
import zipfile
from pathlib import Path

from backend.services import updater_service
from backend.services.updater_pkg import Manifest


def test_create_dir_link_uses_windows_junction(monkeypatch, tmp_path: Path):
    target = tmp_path / "versions" / "1.2.3"
    link = tmp_path / "current.tmp"
    target.mkdir(parents=True)
    calls = []

    def fake_run(args, capture_output, text):
        calls.append(args)
        assert capture_output is True
        assert text is True
        return subprocess.CompletedProcess(args, 0, stdout="Junction created", stderr="")

    monkeypatch.setattr(updater_service, "_is_windows", lambda: True)
    monkeypatch.setattr(updater_service.subprocess, "run", fake_run)

    updater_service._create_dir_link(target, link)

    assert calls == [["cmd", "/c", "mklink", "/J", str(link), str(target)]]


def test_create_dir_link_reports_windows_junction_failure(monkeypatch, tmp_path: Path):
    target = tmp_path / "versions" / "1.2.3"
    link = tmp_path / "current.tmp"
    target.mkdir(parents=True)

    def fake_run(args, capture_output, text):
        return subprocess.CompletedProcess(args, 1, stdout="", stderr="Access denied")

    monkeypatch.setattr(updater_service, "_is_windows", lambda: True)
    monkeypatch.setattr(updater_service.subprocess, "run", fake_run)

    try:
        updater_service._create_dir_link(target, link)
    except updater_service.UpdaterError as exc:
        assert "Access denied" in str(exc)
    else:
        raise AssertionError("expected UpdaterError")


def test_install_rolls_back_and_logs_when_post_install_fails(monkeypatch, tmp_path: Path):
    app_root = tmp_path / "nova"
    svc = updater_service.UpdaterService(app_root)
    svc.bootstrap()

    old_slot = app_root / "versions" / "0.1.0"
    old_slot.mkdir(parents=True)
    (old_slot / "VERSION.txt").write_text("0.1.0\n", encoding="utf-8")
    svc._upsert_index_entry("0.1.0")
    svc._atomic_switch_current(old_slot)

    manifest = Manifest(
        schema_version=1,
        package_id="nova-v0.2.0-full",
        target_version="0.2.0",
        min_base_version="0.1.0",
        release_channel="stable",
        released_at="2026-05-08T00:00:00Z",
        release_notes_md="test",
        size_bytes=1,
        restart_required=True,
        requires_electron_restart=True,
        files=[],
    )
    cached = app_root / "cache" / "updates" / "nova-v0.2.0-full.nova-update"
    cached.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(cached, "w") as zf:
        zf.writestr("payload/VERSION.txt", "0.2.0\n")

    monkeypatch.setattr(updater_service, "validate_package", lambda _: manifest)

    def fail_post_install(phase, *, manifest, slot):
        if phase == "post-install":
            raise updater_service.UpdaterError("post hook exploded")

    monkeypatch.setattr(svc, "_run_migration_stub", fail_post_install)

    try:
        svc.install("nova-v0.2.0-full")
    except updater_service.UpdaterError as exc:
        message = str(exc)
        assert "Install failed" in message
        assert "stage=post-install" in message
        assert "post hook exploded" in message
        assert "rolled back to 0.1.0" in message
        assert "updater-install-failures.log" in message
    else:
        raise AssertionError("expected install failure")

    assert svc.get_current_version() == "0.1.0"
    failure_log = app_root / "data" / "logs" / "updater-install-failures.log"
    text = failure_log.read_text(encoding="utf-8")
    assert "post hook exploded" in text
    assert "0.2.0" in text
    assert "0.1.0" in text
