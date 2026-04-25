from pathlib import Path

from backend.services.vault_health import scan_vault_health


def test_scan_vault_health_reports_missing_attachment(tmp_path: Path):
    vault = tmp_path / "vault"
    note = vault / "Notes" / "A.md"
    note.parent.mkdir(parents=True)
    note.write_text("![missing](_assets/missing.png)", encoding="utf-8")
    (vault / "_assets").mkdir()

    report = scan_vault_health(vault)

    assert report["summary"]["missing_attachments"] == 1
    assert report["issues"][0]["type"] == "missing_attachment"
    assert report["issues"][0]["note_path"] == "Notes/A.md"


def test_scan_vault_health_reports_orphan_attachment(tmp_path: Path):
    vault = tmp_path / "vault"
    assets = vault / "_assets"
    assets.mkdir(parents=True)
    (assets / "unused.png").write_bytes(b"png")

    report = scan_vault_health(vault)

    assert report["summary"]["orphan_attachments"] == 1
    assert report["issues"][0]["type"] == "orphan_attachment"
    assert report["issues"][0]["asset_path"] == "_assets/unused.png"


def test_scan_vault_health_reports_mojibake_text(tmp_path: Path):
    vault = tmp_path / "vault"
    note = vault / "bad.md"
    note.parent.mkdir(parents=True)
    note.write_text("杩欐槸涓€娈典贡鐮佹枃鏈�", encoding="utf-8")

    report = scan_vault_health(vault)

    assert report["summary"]["mojibake_notes"] == 1
    assert report["issues"][0]["type"] == "mojibake_text"
