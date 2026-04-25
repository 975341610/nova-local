from pathlib import Path

from backend.services.template_files import delete_template_file, mirror_template_to_vault


class TemplateStub:
    id = 42
    name = "每日复盘/总结"
    content = "<h1>Review</h1>"
    icon = "📝"
    category = "daily"


def test_mirror_template_to_vault_writes_frontmatter_markdown(tmp_path: Path):
    path = mirror_template_to_vault(tmp_path / "vault", TemplateStub())

    assert path == tmp_path / "vault" / "_templates" / "daily" / "00042-每日复盘_总结.md"
    assert path.read_text(encoding="utf-8").startswith("---\nid: 42\n")
    assert "<h1>Review</h1>" in path.read_text(encoding="utf-8")


def test_delete_template_file_removes_matching_template_files(tmp_path: Path):
    path = mirror_template_to_vault(tmp_path / "vault", TemplateStub())

    assert delete_template_file(tmp_path / "vault", 42) is True
    assert not path.exists()
