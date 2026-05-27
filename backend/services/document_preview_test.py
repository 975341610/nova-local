from pathlib import Path
import zipfile

import pytest

from backend.services import document_preview


def test_preview_markdown_returns_safe_html_and_sections(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    assets = tmp_path / "_assets"
    assets.mkdir()
    doc = assets / "note.md"
    doc.write_text("# Heading\n\n- **Important**\n<script>alert(1)</script>", encoding="utf-8")
    monkeypatch.setattr(document_preview, "_uploads_root", lambda: assets.resolve())

    result = document_preview.preview_document("/api/media/static/files/note.md")

    assert result["kind"] == "markdown"
    assert result["sections"] == [{"title": "Heading", "level": 1}]
    assert "<script>" not in result["html"]
    assert "&lt;script&gt;" in result["html"]


def test_preview_rejects_paths_outside_media_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    assets = tmp_path / "_assets"
    assets.mkdir()
    monkeypatch.setattr(document_preview, "_uploads_root", lambda: assets.resolve())

    with pytest.raises(ValueError):
        document_preview.preview_document("/api/media/static/files/../secret.md")


def test_preview_docx_extracts_text_and_table(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    assets = tmp_path / "_assets"
    assets.mkdir()
    doc = assets / "sample.docx"
    document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter</w:t></w:r></w:p>
    <w:p><w:r><w:t>Body text</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body>
</w:document>"""
    with zipfile.ZipFile(doc, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    monkeypatch.setattr(document_preview, "_uploads_root", lambda: assets.resolve())

    result = document_preview.preview_document("/api/media/static/files/sample.docx")

    assert result["kind"] == "docx"
    assert result["sections"] == [{"title": "Chapter", "level": 1}]
    assert "<p>Body text</p>" in result["html"]
    assert "<td>A1</td>" in result["html"]
