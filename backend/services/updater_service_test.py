import subprocess
from pathlib import Path

from backend.services import updater_service


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
