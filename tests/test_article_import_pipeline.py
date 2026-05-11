from backend.services.document_service import (
    build_url_preview_item,
    combine_imported_urls_for_note_generation,
    extract_video_markdown_from_html,
    extract_video_with_ytdlp,
    fetch_url_article,
    html_to_markdown_article,
    is_video_import_url,
    normalize_imported_content,
    video_info_to_markdown,
)


def test_html_article_extraction_removes_script_and_keeps_heading_paragraphs():
    html = """
    <html>
      <head><title>Page title</title><script>alert(1)</script><style>body{}</style></head>
      <body>
        <nav>Navigation</nav>
        <article>
          <h1>Article title</h1>
          <p>First paragraph.</p>
          <h2>Section</h2>
          <p>Second paragraph.</p>
        </article>
      </body>
    </html>
    """

    title, markdown = html_to_markdown_article(html, fallback_title="fallback")
    normalized = normalize_imported_content(title, markdown, source_type="url", source_name="https://example.com/a")

    assert title == "Article title"
    assert "# Article title" in markdown
    assert "First paragraph." in markdown
    assert "alert(1)" not in markdown
    assert normalized["blocks"][0]["type"] == "heading"
    assert any(block["type"] == "paragraph" and "Second paragraph." in block["text"] for block in normalized["blocks"])


def test_build_url_preview_item_reports_article_summary_and_source_url():
    html = """
    <html>
      <head><title>Example article</title></head>
      <body><article><h1>Example article</h1><p>Useful imported context.</p></article></body>
    </html>
    """

    preview = build_url_preview_item("https://example.com/post", html)

    assert preview["file_name"] == "https://example.com/post"
    assert preview["file_type"] == "url"
    assert preview["title"] == "Example article"
    assert preview["status"] == "ok"
    assert "Useful imported context" in preview["summary"]
    assert preview["block_count"] >= 2


def test_combine_imported_urls_preserves_url_sources_and_template():
    combined = combine_imported_urls_for_note_generation(
        [
            {
                "url": "https://example.com/a",
                "title": "Article A",
                "content": "# Article A\n\nFirst source.",
            },
            {
                "url": "https://example.com/b",
                "title": "Article B",
                "content": "# Article B\n\nSecond source.",
            },
        ],
        template_id="study",
    )

    assert combined["source_type"] == "url"
    assert combined["title"] == "AI整理 - 多链接导入"
    assert combined["metadata"]["template_id"] == "study"
    assert combined["metadata"]["import_batch_id"].startswith("imp_")
    assert combined["metadata"]["url_count"] == 2
    assert combined["metadata"]["source_urls"] == ["https://example.com/a", "https://example.com/b"]
    assert combined["metadata"]["source_refs"] == [
        {"kind": "url", "url": "https://example.com/a", "title": "Article A"},
        {"kind": "url", "url": "https://example.com/b", "title": "Article B"},
    ]
    assert any(block["metadata"].get("source_url") == "https://example.com/a" for block in combined["blocks"])


def test_combine_imported_urls_marks_video_source_refs():
    combined = combine_imported_urls_for_note_generation(
        [
            {
                "url": "https://www.youtube.com/watch?v=demo",
                "title": "Demo Video",
                "content": "# Demo Video\n\n## Transcript\n00:00 开场",
            },
        ],
        template_id="video",
    )

    assert combined["metadata"]["template_id"] == "video"
    assert combined["metadata"]["source_refs"] == [
        {"kind": "video", "url": "https://www.youtube.com/watch?v=demo", "title": "Demo Video"},
    ]


def test_video_url_detection_supports_bilibili_douyin_and_youtube():
    assert is_video_import_url("https://www.bilibili.com/video/BV1xx411c7mD")
    assert is_video_import_url("https://www.douyin.com/video/7345678901234567890")
    assert is_video_import_url("https://youtu.be/dQw4w9WgXcQ")
    assert not is_video_import_url("https://example.com/article")


def test_video_metadata_extraction_uses_open_graph_and_json_ld_transcript():
    html = """
    <html>
      <head>
        <meta property="og:title" content="Video title">
        <meta property="og:description" content="Video description">
        <meta property="og:site_name" content="YouTube">
        <script type="application/ld+json">
        {"@type":"VideoObject","name":"JSON title","description":"JSON description","transcript":"Line one. Line two."}
        </script>
      </head>
      <body></body>
    </html>
    """

    title, markdown = extract_video_markdown_from_html("https://www.youtube.com/watch?v=abc", html)

    assert title == "Video title"
    assert "# Video title" in markdown
    assert "Video description" in markdown
    assert "Line one. Line two." in markdown
    assert "https://www.youtube.com/watch?v=abc" in markdown


def test_video_metadata_extraction_reports_missing_transcript_clearly():
    html = '<html><head><title>Plain video</title><meta name="description" content="Short intro"></head></html>'

    title, markdown = extract_video_markdown_from_html("https://www.bilibili.com/video/BV1xx411c7mD", html)

    assert title == "Plain video"
    assert "Short intro" in markdown
    assert "No readable transcript was found" in markdown


def test_douyin_metadata_extraction_uses_page_json_when_available():
    html = """
    <html><head><meta name="description" content="默认描述"></head>
    <body><script>{"desc":"抖音视频简介","nickname":"作者A"}</script></body></html>
    """

    title, markdown = extract_video_markdown_from_html("https://www.douyin.com/video/7345678901234567890", html)
    from backend.services.document_service import enrich_douyin_video_markdown
    title, markdown = enrich_douyin_video_markdown("https://www.douyin.com/video/7345678901234567890", html, title, markdown)

    assert title == "抖音视频简介"
    assert "Uploader: 作者A" in markdown
    assert "抖音视频简介" in markdown


def test_fetch_url_article_returns_video_fallback_when_douyin_fetch_fails(monkeypatch):
    import asyncio

    monkeypatch.setattr("backend.services.document_service.extract_video_with_ytdlp", lambda url: None)

    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url):
            raise RuntimeError("blocked")

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: FailingClient())

    article = asyncio.run(fetch_url_article("https://www.douyin.com/video/7345678901234567890"))

    assert article["title"] == "抖音视频"
    assert "平台登录限制" in article["content"]
    assert "把字幕文件继续追加到这篇笔记" in article["content"]
    assert "blocked" in article["content"]


def test_video_info_to_markdown_uses_ytdlp_metadata_and_subtitles():
    title, markdown = video_info_to_markdown(
        "https://youtu.be/abc",
        {
            "title": "Downloaded metadata title",
            "description": "Long video description",
            "extractor": "youtube",
            "subtitles_text": "Caption line one.\nCaption line two.",
            "duration": 125,
            "uploader": "Uploader name",
        },
    )

    assert title == "Downloaded metadata title"
    assert "Downloaded metadata title" in markdown
    assert "Long video description" in markdown
    assert "Caption line one." in markdown
    assert "Duration: 125 seconds" in markdown
    assert "Uploader name" in markdown


def test_extract_video_with_ytdlp_returns_none_when_executable_missing(monkeypatch):
    monkeypatch.setattr("backend.services.document_service.resolve_ytdlp_command", lambda: None)

    assert extract_video_with_ytdlp("https://youtu.be/abc") is None


def test_fetch_url_article_prefers_ytdlp_for_video_urls(monkeypatch):
    import asyncio

    monkeypatch.setattr(
        "backend.services.document_service.extract_video_with_ytdlp",
        lambda url: {
            "url": url,
            "title": "yt-dlp title",
            "content": "# yt-dlp title\n\n## Transcript\nFull transcript.",
            "html": "# yt-dlp title\n\n## Transcript\nFull transcript.",
        },
    )

    article = asyncio.run(fetch_url_article("https://youtu.be/abc"))

    assert article["title"] == "yt-dlp title"
    assert "Full transcript" in article["content"]
