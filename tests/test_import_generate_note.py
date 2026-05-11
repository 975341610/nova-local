from pathlib import Path

from backend.services.document_service import combine_imported_documents_for_note_generation
from backend.services.import_generation import generate_note_from_imported_documents


class FakeAIClient:
    def stream_chat(self, messages, config):
        async def _stream():
            if False:
                yield ""
        return _stream()


def test_combine_imported_documents_generates_one_normalized_content_for_multiple_files():
    combined = combine_imported_documents_for_note_generation(
        [
            {
                "file_name": "a.md",
                "title": "a",
                "content": "# 第一份资料\n\n- 要点 A",
            },
            {
                "file_name": "b.txt",
                "title": "b",
                "content": "第二份资料\n\n后续行动：整理结论",
            },
        ]
    )

    assert combined["source_type"] == "file"
    assert combined["title"] == "AI整理 - 多文件导入"
    assert combined["metadata"]["file_count"] == 2
    assert combined["metadata"]["source_names"] == ["a.md", "b.txt"]
    assert combined["metadata"]["import_batch_id"].startswith("imp_")
    assert combined["metadata"]["source_refs"] == [
        {"kind": "file", "name": "a.md", "title": "a"},
        {"kind": "file", "name": "b.txt", "title": "b"},
    ]
    assert any(block["type"] == "heading" and block["text"] == "a.md" for block in combined["blocks"])
    assert any(block["type"] == "heading" and block["text"] == "b.txt" for block in combined["blocks"])
    assert "第一份资料" in combined["plain_text"]
    assert "第二份资料" in combined["plain_text"]


def test_combine_imported_documents_uses_single_file_title_for_single_file():
    combined = combine_imported_documents_for_note_generation(
        [
            {
                "file_name": "meeting.md",
                "title": "meeting",
                "content": "# 会议纪要\n\n讨论 AI 导入整理。",
            }
        ]
    )

    assert combined["title"] == "AI整理 - meeting"
    assert combined["metadata"]["file_count"] == 1
    assert combined["metadata"]["source_names"] == ["meeting.md"]
    assert "会议纪要" in combined["plain_text"]


def test_generate_note_from_imported_documents_returns_generated_note_without_persisting():
    import asyncio

    result = asyncio.run(
        generate_note_from_imported_documents(
            documents=[
                {"file_name": "a.md", "title": "a", "content": "# 第一份资料\n\n- 要点 A"},
                {"file_name": "b.txt", "title": "b", "content": "第二份资料\n\n后续行动：整理结论"},
            ],
            template_id="meeting",
            ai_client=FakeAIClient(),
            llm_config=None,
        )
    )

    assert result["metadata"]["file_count"] == 2
    assert result["metadata"]["source_names"] == ["a.md", "b.txt"]
    assert result["metadata"]["template_id"] == "meeting"
    assert result["metadata"]["import_batch_id"].startswith("imp_")
    assert len(result["metadata"]["source_refs"]) == 2
    assert result["source_type"] == "file"
    assert result["title"] == "AI整理 - 多文件导入"
    assert "markdown" in result
    assert "note" not in result


def test_import_generate_note_route_returns_generated_note_without_persisting():
    routes = Path(__file__).resolve().parents[1] / "backend" / "api" / "routes.py"
    text = routes.read_text(encoding="utf-8")

    assert '@router.post("/import/generate-note", response_model=GeneratedNoteResponse)' in text
    assert "async def import_and_generate_note" in text
    route_start = text.index('@router.post("/import/generate-note"')
    route_end = text.index('@router.post("/ai/generate-note-from-content"', route_start)
    route_block = text[route_start:route_end]
    assert 'template_id: str = Form("general")' in route_block
    assert "GeneratedNotePersistResponse" not in route_block
    assert "persist_note_sync" not in route_block


def test_import_preview_route_exists_and_reports_parse_status():
    routes = Path(__file__).resolve().parents[1] / "backend" / "api" / "routes.py"
    text = routes.read_text(encoding="utf-8")

    assert '@router.post("/import/preview"' in text
    assert "async def preview_import_files" in text
    assert "ImportPreviewResponse" in text
    assert "ImportPreviewItem" in text


def test_url_import_routes_exist_and_reuse_generated_note_contract():
    routes = Path(__file__).resolve().parents[1] / "backend" / "api" / "routes.py"
    text = routes.read_text(encoding="utf-8")

    assert '@router.post("/import/url/preview", response_model=ImportPreviewResponse)' in text
    assert '@router.post("/import/url/generate-note", response_model=GeneratedNoteResponse)' in text
    assert "async def preview_import_urls" in text
    assert "async def import_urls_and_generate_note" in text
    assert "fetch_url_article" in text


def test_url_preview_route_uses_video_import_helpers():
    routes = Path(__file__).resolve().parents[1] / "backend" / "api" / "routes.py"
    text = routes.read_text(encoding="utf-8")

    route_start = text.index('@router.post("/import/url/preview"')
    route_end = text.index('@router.post("/import/generate-note"', route_start)
    route_block = text[route_start:route_end]
    assert "fetch_url_article" in route_block
    assert "build_url_preview_item" in route_block
    assert "status=\"error\"" in route_block


def test_import_batch_ask_route_uses_batch_property_filter():
    routes = Path(__file__).resolve().parents[1] / "backend" / "api" / "routes.py"
    text = routes.read_text(encoding="utf-8")

    assert '@router.post("/import/batches/{batch_id}/ask", response_model=AskResponse)' in text
    assert "async def ask_import_batch" in text
    route_start = text.index('@router.post("/import/batches/{batch_id}/ask"')
    route_end = text.index('@router.post("/search"', route_start)
    route_block = text[route_start:route_end]
    assert '"import_batch_id": batch_id' in route_block
    assert "list_notes(db, property_filter" in route_block
    assert "build_import_batch_citations" in route_block
