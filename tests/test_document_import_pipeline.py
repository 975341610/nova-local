from backend.services.document_service import build_import_preview_item, normalize_imported_content, parse_document


def test_parse_markdown_document_returns_normalized_blocks():
    title, parsed = parse_document("AI-notes.md", b"# Title\n\nFirst paragraph\n\n- Point one\n- Point two")
    normalized = normalize_imported_content(title, parsed, source_type="file", source_name="AI-notes.md")

    assert normalized["title"] == "AI-notes"
    assert normalized["source_type"] == "file"
    assert normalized["blocks"][0]["type"] == "heading"
    assert normalized["blocks"][0]["text"] == "Title"
    assert any(block["type"] == "list" and "Point one" in block["text"] for block in normalized["blocks"])
    assert "First paragraph" in normalized["plain_text"]


def test_parse_csv_document_as_markdown_table():
    title, parsed = parse_document("items.csv", b"name,count\napple,2\nbanana,3")
    normalized = normalize_imported_content(title, parsed, source_type="file", source_name="items.csv")

    assert title == "items"
    assert "| name | count |" in parsed
    assert "| apple | 2 |" in parsed
    assert any(block["type"] == "table" and "apple" in block["text"] for block in normalized["blocks"])


def test_build_import_preview_item_reports_summary_and_status():
    item = build_import_preview_item(
        "brief.md",
        b"# Project Brief\n\nFirst paragraph.\n\n- Next step",
    )

    assert item["file_name"] == "brief.md"
    assert item["status"] == "ok"
    assert item["title"] == "brief"
    assert item["block_count"] >= 2
    assert "Project Brief" in item["summary"]


def test_build_import_preview_item_reports_unsupported_file_error():
    item = build_import_preview_item("archive.zip", b"PK")

    assert item["file_name"] == "archive.zip"
    assert item["status"] == "error"
    assert item["title"] == "archive"
    assert "Unsupported file type" in item["message"]
