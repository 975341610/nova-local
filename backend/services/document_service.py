from __future__ import annotations

import csv
import io
import json
import re
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse
from uuid import uuid4

import httpx
from pypdf import PdfReader


def parse_document(file_name: str, raw_bytes: bytes) -> tuple[str, str]:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".txt", ".md"}:
        text = raw_bytes.decode("utf-8", errors="ignore")
        return Path(file_name).stem, text
    if suffix == ".csv":
        text = raw_bytes.decode("utf-8-sig", errors="ignore")
        return Path(file_name).stem, csv_to_markdown_table(text)
    if suffix == ".pdf":
        safe_name = Path(file_name).name or "import.pdf"
        temp_path = Path(tempfile.gettempdir()) / safe_name
        try:
            temp_path.write_bytes(raw_bytes)
            reader = PdfReader(str(temp_path))
            pages: list[str] = []
            for index, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    pages.append(f"<!-- page:{index} -->\n{page_text}")
        finally:
            temp_path.unlink(missing_ok=True)
        return Path(file_name).stem, "\n\n".join(pages)
    raise ValueError(f"Unsupported file type: {suffix}")


def build_import_preview_item(file_name: str, raw_bytes: bytes) -> dict[str, Any]:
    suffix = Path(file_name).suffix.lower().lstrip(".") or "unknown"
    base = {
        "file_name": file_name,
        "file_type": suffix,
        "size": len(raw_bytes),
        "title": Path(file_name).stem or file_name,
        "status": "ok",
        "message": "",
        "summary": "",
        "block_count": 0,
    }
    try:
        title, parsed = parse_document(file_name, raw_bytes)
        normalized = normalize_imported_content(title, parsed, source_type="file", source_name=file_name)
        plain_text = str(normalized.get("plain_text") or "").strip()
        blocks = normalized.get("blocks") if isinstance(normalized.get("blocks"), list) else []
        if not plain_text:
            return {
                **base,
                "title": title or base["title"],
                "status": "empty",
                "message": "Parsed file is empty.",
            }
        return {
            **base,
            "title": title or base["title"],
            "summary": summarize_preview_text(plain_text),
            "block_count": len(blocks),
        }
    except Exception as error:
        return {
            **base,
            "status": "error",
            "message": str(error),
        }


def build_url_preview_item(url: str, html: str) -> dict[str, Any]:
    title, markdown = html_to_markdown_article(html, fallback_title=url)
    normalized = normalize_imported_content(title, markdown, source_type="url", source_name=url, metadata={"url": url})
    plain_text = str(normalized.get("plain_text") or "").strip()
    blocks = normalized.get("blocks") if isinstance(normalized.get("blocks"), list) else []
    base = {
        "file_name": url,
        "file_type": "url",
        "size": len(html.encode("utf-8", errors="ignore")),
        "title": title or url,
        "status": "ok",
        "message": "",
        "summary": "",
        "block_count": 0,
    }
    if not plain_text:
        return {
            **base,
            "status": "empty",
            "message": "Fetched page did not contain readable article text.",
        }
    return {
        **base,
        "summary": summarize_preview_text(plain_text),
        "block_count": len(blocks),
    }


async def fetch_url_article(url: str, *, timeout_seconds: float = 15.0, max_bytes: int = 2_000_000) -> dict[str, str]:
    normalized_url = normalize_import_url(url)
    is_video_url = is_video_import_url(normalized_url)
    if is_video_url:
        ytdlp_article = extract_video_with_ytdlp(normalized_url)
        if ytdlp_article:
            return ytdlp_article

    headers = {
        "User-Agent": "NovaLocal/AIImport (+https://localhost)",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout_seconds, headers=headers, trust_env=True) as client:
        try:
            response = await client.get(normalized_url)
            response.raise_for_status()
        except Exception as error:
            if is_video_url:
                return build_video_fallback_article(normalized_url, fetch_error=str(error))
            raise
        content_type = response.headers.get("content-type", "")
        if content_type and not any(kind in content_type.lower() for kind in ("html", "text", "xml")):
            raise ValueError(f"URL returned unsupported content type: {content_type}")
        raw = response.content[: max_bytes + 1]
        if len(raw) > max_bytes:
            raise ValueError(f"URL content is too large. Limit is {max_bytes} bytes.")
        text = raw.decode(response.encoding or "utf-8", errors="ignore")
    if is_video_url:
        title, markdown = extract_video_markdown_from_html(normalized_url, text)
        if is_douyin_url(normalized_url):
            title, markdown = enrich_douyin_video_markdown(normalized_url, text, title, markdown)
    else:
        title, markdown = html_to_markdown_article(text, fallback_title=normalized_url)
    return {"url": normalized_url, "title": title, "content": markdown, "html": text}


def normalize_import_url(url: str) -> str:
    candidate = (url or "").strip()
    if not candidate:
        raise ValueError("URL is empty.")
    if not re.match(r"^https?://", candidate, re.IGNORECASE):
        candidate = f"https://{candidate}"
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Only http and https URLs are supported.")
    return candidate


def is_video_import_url(url: str) -> bool:
    host = (urlparse((url or "").strip()).netloc or "").lower()
    return any(
        marker in host
        for marker in (
            "youtube.com",
            "youtu.be",
            "bilibili.com",
            "b23.tv",
            "douyin.com",
            "iesdouyin.com",
            "tiktok.com",
        )
    )


def is_douyin_url(url: str) -> bool:
    host = (urlparse((url or "").strip()).netloc or "").lower()
    return any(marker in host for marker in ("douyin.com", "iesdouyin.com"))


def extract_video_with_ytdlp(url: str, *, timeout_seconds: int = 35) -> dict[str, str] | None:
    command = resolve_ytdlp_command()
    if not command:
        return None

    info = run_ytdlp_json(command, url, timeout_seconds=timeout_seconds)
    if not info:
        return None
    subtitles_text = extract_ytdlp_subtitle_text(info)
    if subtitles_text:
        info["subtitles_text"] = subtitles_text
    title, markdown = video_info_to_markdown(url, info)
    return {"url": url, "title": title, "content": markdown, "html": markdown}


def resolve_ytdlp_command() -> list[str] | None:
    executable = shutil.which("yt-dlp")
    if executable:
        return [executable]
    return None


def run_ytdlp_json(command: list[str], url: str, *, timeout_seconds: int) -> dict[str, Any] | None:
    args = [
        *command,
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "--ignore-no-formats-error",
        "--no-playlist",
        url,
    ]
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0 or not completed.stdout.strip():
        return None
    try:
        data = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def extract_ytdlp_subtitle_text(info: dict[str, Any]) -> str:
    for collection_key in ("subtitles", "automatic_captions"):
        collection = info.get(collection_key)
        if not isinstance(collection, dict):
            continue
        for language in ("zh-Hans", "zh-CN", "zh", "en", "en-US"):
            tracks = collection.get(language)
            if isinstance(tracks, list):
                text = first_inline_subtitle_text(tracks)
                if text:
                    return text
    return ""


def first_inline_subtitle_text(tracks: list[Any]) -> str:
    for track in tracks:
        if not isinstance(track, dict):
            continue
        data = track.get("data")
        if isinstance(data, str) and data.strip():
            return subtitle_payload_to_text(data)
    return ""


def subtitle_payload_to_text(payload: str) -> str:
    if payload.lstrip().startswith("{"):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            data = None
        events = data.get("events") if isinstance(data, dict) else None
        if isinstance(events, list):
            snippets: list[str] = []
            for event in events:
                segs = event.get("segs") if isinstance(event, dict) else None
                if isinstance(segs, list):
                    snippets.extend(str(seg.get("utf8") or "") for seg in segs if isinstance(seg, dict))
            return normalize_whitespace(" ".join(snippets))
    cleaned_lines = []
    for line in payload.splitlines():
        stripped = line.strip()
        if not stripped or stripped.upper().startswith("WEBVTT") or "-->" in stripped or stripped.isdigit():
            continue
        cleaned_lines.append(stripped)
    return normalize_whitespace(" ".join(cleaned_lines))


def video_info_to_markdown(url: str, info: dict[str, Any]) -> tuple[str, str]:
    title = first_non_empty(str(info.get("title") or ""), url)
    description = first_non_empty(str(info.get("description") or ""))
    platform = first_non_empty(str(info.get("extractor") or ""), urlparse(url).netloc)
    uploader = first_non_empty(str(info.get("uploader") or ""), str(info.get("channel") or ""))
    duration = info.get("duration")
    transcript = first_non_empty(str(info.get("subtitles_text") or ""))

    lines = [f"# {title}", "", "## Source", f"- URL: {url}", f"- Platform: {platform}"]
    if uploader:
        lines.append(f"- Uploader: {uploader}")
    if isinstance(duration, (int, float)) and duration > 0:
        lines.append(f"- Duration: {int(duration)} seconds")
    if description:
        lines.extend(["", "## Description", description])
    if transcript:
        lines.extend(["", "## Transcript", transcript])
    else:
        lines.extend(["", "## Transcript", "No readable transcript was found by yt-dlp or the fetched page."])
    return title, "\n".join(lines)


def build_video_fallback_article(url: str, *, fetch_error: str = "") -> dict[str, str]:
    platform = urlparse(url).netloc or "video"
    title = "抖音视频" if is_douyin_url(url) else f"{platform} 视频"
    lines = [
        f"# {title}",
        "",
        "## Source",
        f"- URL: {url}",
        f"- Platform: {platform}",
        "",
        "## Description",
        "Nova 暂时无法直接读取该视频页面的完整正文或字幕。常见原因是平台登录限制、反爬拦截、地区限制或视频没有公开字幕。",
        "",
        "## 可继续处理",
        "- 已保留原始视频链接，可在笔记中生成来源卡片。",
        "- 如果你能导出字幕或文案，可以把字幕文件继续追加到这篇笔记，Nova 会重新整理。",
        "- 如果稍后网络或平台访问恢复，可以重新导入该链接。",
    ]
    if fetch_error:
        lines.extend(["", "## Fetch note", fetch_error[:500]])
    lines.extend(["", "## Transcript", "No readable transcript was found by yt-dlp or the fetched page."])
    markdown = "\n".join(lines)
    return {"url": url, "title": title, "content": markdown, "html": markdown}


def enrich_douyin_video_markdown(url: str, html: str, title: str, markdown: str) -> tuple[str, str]:
    metadata = extract_douyin_metadata(html)
    next_title = metadata.get("title") or title or "抖音视频"
    author = metadata.get("author")
    description = metadata.get("description")
    if not any((author, description)) and "No readable transcript was found" not in markdown:
        return next_title, markdown

    lines = [
        f"# {next_title}",
        "",
        "## Source",
        f"- URL: {url}",
        "- Platform: douyin",
    ]
    if author:
        lines.append(f"- Uploader: {author}")
    if description:
        lines.extend(["", "## Description", description])
    else:
        lines.extend(["", "## Description", "页面没有暴露可稳定读取的视频简介。"])
    lines.extend(["", "## Transcript", "No readable transcript was found by yt-dlp or the fetched page."])
    return next_title, "\n".join(lines)


def extract_douyin_metadata(html: str) -> dict[str, str]:
    decoded = html
    for _ in range(2):
        decoded = unquote(decoded)
    candidates = {
        "title": [
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            r'"desc"\s*:\s*"([^"]+)"',
            r'"share_title"\s*:\s*"([^"]+)"',
        ],
        "description": [
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
            r'"desc"\s*:\s*"([^"]+)"',
        ],
        "author": [
            r'"nickname"\s*:\s*"([^"]+)"',
            r'"authorName"\s*:\s*"([^"]+)"',
            r'"unique_id"\s*:\s*"([^"]+)"',
        ],
    }
    result: dict[str, str] = {}
    for key, patterns in candidates.items():
        for pattern in patterns:
            match = re.search(pattern, decoded, re.IGNORECASE)
            if match:
                raw_value = match.group(1)
                if "\\u" in raw_value or "\\x" in raw_value:
                    raw_value = raw_value.encode("utf-8").decode("unicode_escape", errors="ignore")
                value = normalize_whitespace(raw_value)
                if value:
                    result[key] = value
                    break
    return result


def summarize_preview_text(text: str, max_chars: int = 240) -> str:
    cleaned = normalize_whitespace(text)
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 1].rstrip() + "..."


def csv_to_markdown_table(text: str) -> str:
    rows = list(csv.reader(io.StringIO(text)))
    rows = [[cell.strip() for cell in row] for row in rows if any(cell.strip() for cell in row)]
    if not rows:
        return ""

    width = max(len(row) for row in rows)
    normalized = [row + [""] * (width - len(row)) for row in rows]
    header = normalized[0]
    body = normalized[1:]

    lines = [
        "| " + " | ".join(escape_table_cell(cell) for cell in header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    lines.extend("| " + " | ".join(escape_table_cell(cell) for cell in row) + " |" for row in body)
    return "\n".join(lines)


def normalize_imported_content(
    title: str,
    content: str,
    *,
    source_type: str,
    source_name: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    blocks = markdown_to_normalized_blocks(content)
    return {
        "source_type": source_type,
        "title": title or source_name or "Untitled Import",
        "blocks": blocks,
        "plain_text": "\n".join(block["text"] for block in blocks if block.get("text")),
        "metadata": {"source_name": source_name, **(metadata or {})},
    }


def markdown_to_normalized_blocks(content: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    paragraph: list[str] = []
    list_items: list[str] = []
    current_page: int | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            blocks.append({"type": "paragraph", "text": "\n".join(paragraph), "metadata": page_meta(current_page)})
            paragraph = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append({"type": "list", "text": "\n".join(list_items), "metadata": page_meta(current_page)})
            list_items = []

    for raw_line in content.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if stripped.startswith("<!-- page:") and stripped.endswith("-->"):
            flush_paragraph()
            flush_list()
            try:
                current_page = int(stripped.removeprefix("<!-- page:").removesuffix("-->").strip())
            except ValueError:
                current_page = None
            continue
        if not stripped:
            flush_paragraph()
            flush_list()
            continue

        heading = _match_heading(stripped)
        if heading:
            flush_paragraph()
            flush_list()
            blocks.append({"type": "heading", "text": heading, "metadata": page_meta(current_page)})
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            flush_paragraph()
            flush_list()
            blocks.append({"type": "table", "text": stripped, "metadata": page_meta(current_page)})
            continue

        bullet = _match_list_item(stripped)
        if bullet:
            flush_paragraph()
            list_items.append(bullet)
            continue

        flush_list()
        paragraph.append(stripped)

    flush_paragraph()
    flush_list()
    return blocks


def combine_imported_documents_for_note_generation(
    documents: list[dict[str, Any]],
    *,
    template_id: str = "general",
) -> dict[str, Any]:
    source_names = [str(doc.get("file_name") or doc.get("title") or "Untitled") for doc in documents]
    source_refs = [
        {
            "kind": "file",
            "name": str(doc.get("file_name") or doc.get("title") or "Untitled"),
            "title": str(doc.get("title") or Path(str(doc.get("file_name") or "Untitled")).stem or "Untitled"),
        }
        for doc in documents
    ]
    file_count = len(source_names)
    if file_count == 1:
        first_title = str(documents[0].get("title") or Path(source_names[0]).stem or "Untitled Import")
        title = f"AI整理 - {first_title}"
    else:
        title = "AI整理 - 多文件导入"

    merged_blocks: list[dict[str, Any]] = []
    for doc in documents:
        file_name = str(doc.get("file_name") or doc.get("title") or "Untitled")
        doc_title = str(doc.get("title") or Path(file_name).stem or file_name)
        content = str(doc.get("content") or "")
        merged_blocks.append({"type": "heading", "text": file_name, "metadata": {"source_name": file_name}})
        for block in markdown_to_normalized_blocks(content):
            block_metadata = block.get("metadata") if isinstance(block.get("metadata"), dict) else {}
            merged_blocks.append(
                {
                    **block,
                    "metadata": {"source_name": file_name, "title": doc_title, **block_metadata},
                }
            )

    return {
        "source_type": "file",
        "title": title,
        "blocks": merged_blocks,
        "plain_text": "\n".join(block["text"] for block in merged_blocks if block.get("text")),
        "metadata": {
            "import_batch_id": new_import_batch_id(),
            "source_names": source_names,
            "source_refs": source_refs,
            "file_count": file_count,
            "template_id": template_id,
        },
    }


def combine_imported_urls_for_note_generation(
    documents: list[dict[str, Any]],
    *,
    template_id: str = "general",
) -> dict[str, Any]:
    source_urls = [str(doc.get("url") or doc.get("file_name") or doc.get("title") or "Untitled") for doc in documents]
    source_refs = [
        {
            "kind": "video" if is_video_import_url(str(doc.get("url") or doc.get("file_name") or doc.get("title") or "")) else "url",
            "url": str(doc.get("url") or doc.get("file_name") or doc.get("title") or "Untitled"),
            "title": str(doc.get("title") or doc.get("url") or "Untitled"),
        }
        for doc in documents
    ]
    url_count = len(source_urls)
    if url_count == 1:
        first_title = str(documents[0].get("title") or source_urls[0] or "Untitled Import")
        title = f"AI整理 - {first_title}"
    else:
        title = "AI整理 - 多链接导入"

    merged_blocks: list[dict[str, Any]] = []
    for doc in documents:
        source_url = str(doc.get("url") or doc.get("file_name") or doc.get("title") or "Untitled")
        doc_title = str(doc.get("title") or source_url)
        content = str(doc.get("content") or "")
        merged_blocks.append({"type": "heading", "text": doc_title, "metadata": {"source_url": source_url}})
        for block in markdown_to_normalized_blocks(content):
            block_metadata = block.get("metadata") if isinstance(block.get("metadata"), dict) else {}
            merged_blocks.append(
                {
                    **block,
                    "metadata": {"source_url": source_url, "title": doc_title, **block_metadata},
                }
            )

    return {
        "source_type": "url",
        "title": title,
        "blocks": merged_blocks,
        "plain_text": "\n".join(block["text"] for block in merged_blocks if block.get("text")),
        "metadata": {
            "import_batch_id": new_import_batch_id(),
            "source_urls": source_urls,
            "source_refs": source_refs,
            "url_count": url_count,
            "template_id": template_id,
        },
    }


def new_import_batch_id() -> str:
    return f"imp_{uuid4().hex}"


def html_to_markdown_article(html: str, *, fallback_title: str = "Untitled Article") -> tuple[str, str]:
    parser = _ArticleHTMLParser()
    parser.feed(html)
    title = parser.article_title or parser.page_title or fallback_title
    lines: list[str] = []
    title_emitted = False

    for block_type, text in parser.blocks:
        cleaned = normalize_whitespace(text)
        if not cleaned:
            continue
        if block_type == "heading":
            level = 1 if not title_emitted else 2
            lines.append(f"{'#' * level} {cleaned}")
            title_emitted = title_emitted or cleaned == title
        elif block_type == "list":
            lines.append(f"- {cleaned}")
        elif block_type == "quote":
            lines.append(f"> {cleaned}")
        else:
            lines.append(cleaned)

    if lines and not lines[0].startswith("#"):
        lines.insert(0, f"# {title}")
    elif not lines:
        lines = [f"# {title}"]

    return title, "\n\n".join(lines)


def extract_video_markdown_from_html(url: str, html: str) -> tuple[str, str]:
    parser = _VideoMetadataHTMLParser()
    parser.feed(html)
    json_ld = extract_video_json_ld(html)
    youtube_transcript = extract_youtube_inline_transcript(html)

    title = first_non_empty(
        parser.meta.get("og:title"),
        parser.meta.get("twitter:title"),
        json_ld.get("name"),
        parser.page_title,
        url,
    )
    description = first_non_empty(
        parser.meta.get("og:description"),
        parser.meta.get("description"),
        parser.meta.get("twitter:description"),
        json_ld.get("description"),
    )
    site_name = first_non_empty(parser.meta.get("og:site_name"), urlparse(url).netloc)
    transcript = first_non_empty(json_ld.get("transcript"), youtube_transcript)

    lines = [f"# {title}", "", "## Source", f"- URL: {url}", f"- Platform: {site_name}"]
    if description:
        lines.extend(["", "## Description", description])
    if transcript:
        lines.extend(["", "## Transcript", transcript])
    else:
        lines.extend(["", "## Transcript", "No readable transcript was found in the fetched page."])
    return title, "\n".join(lines)


def extract_video_json_ld(html: str) -> dict[str, str]:
    for raw in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, flags=re.IGNORECASE | re.DOTALL):
        try:
            data = json.loads(raw.strip())
        except json.JSONDecodeError:
            continue
        for item in flatten_json_ld(data):
            item_type = item.get("@type")
            if isinstance(item_type, list):
                is_video = any(str(value).lower() == "videoobject" for value in item_type)
            else:
                is_video = str(item_type).lower() == "videoobject"
            if is_video:
                return {
                    "name": str(item.get("name") or ""),
                    "description": str(item.get("description") or ""),
                    "transcript": str(item.get("transcript") or ""),
                }
    return {}


def flatten_json_ld(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        items = [data]
        graph = data.get("@graph")
        if isinstance(graph, list):
            items.extend(item for item in graph if isinstance(item, dict))
        return items
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def extract_youtube_inline_transcript(html: str) -> str:
    # Some saved/exported YouTube pages include simpleCaptionTracks snippets.
    # Full caption URLs are intentionally not fetched here to avoid extra network
    # requests and authentication-sensitive failures during import preview.
    matches = re.findall(r'"simpleText"\s*:\s*"([^"]+)"', html)
    if not matches:
        return ""
    return normalize_whitespace(" ".join(decode_json_string(value) for value in matches))


def decode_json_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return value


def first_non_empty(*values: str | None) -> str:
    for value in values:
        text = normalize_whitespace(str(value or ""))
        if text:
            return text
    return ""


class _ArticleHTMLParser(HTMLParser):
    block_tags = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote"}
    ignored_tags = {"script", "style", "nav", "header", "footer", "aside"}

    def __init__(self) -> None:
        super().__init__()
        self.blocks: list[tuple[str, str]] = []
        self.page_title = ""
        self.article_title = ""
        self._tag_stack: list[str] = []
        self._ignore_depth = 0
        self._current_tag: str | None = None
        self._current_text: list[str] = []
        self._title_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        self._tag_stack.append(tag)
        if tag in self.ignored_tags:
            self._ignore_depth += 1
        if self._ignore_depth:
            return
        if tag in self.block_tags:
            self._flush_current()
            self._current_tag = tag
            self._current_text = []
        elif tag == "br" and self._current_tag:
            self._current_text.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._ignore_depth:
            if tag in self.ignored_tags:
                self._ignore_depth = max(0, self._ignore_depth - 1)
            if self._tag_stack:
                self._tag_stack.pop()
            return
        if tag in self.block_tags:
            self._flush_current()
        elif tag == "title":
            self.page_title = normalize_whitespace("".join(self._title_text))
            self._title_text = []
        if self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._ignore_depth:
            return
        if self._tag_stack and self._tag_stack[-1] == "title":
            self._title_text.append(data)
        if self._current_tag:
            self._current_text.append(data)

    def _flush_current(self) -> None:
        if not self._current_tag:
            return
        text = normalize_whitespace("".join(self._current_text))
        if text:
            if self._current_tag.startswith("h"):
                self.article_title = self.article_title or text
                block_type = "heading"
            elif self._current_tag == "li":
                block_type = "list"
            elif self._current_tag == "blockquote":
                block_type = "quote"
            else:
                block_type = "paragraph"
            self.blocks.append((block_type, text))
        self._current_tag = None
        self._current_text = []


class _VideoMetadataHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self.page_title = ""
        self._in_title = False
        self._title_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr_map = {key.lower(): value or "" for key, value in attrs}
        if tag == "title":
            self._in_title = True
            self._title_text = []
        if tag == "meta":
            key = (attr_map.get("property") or attr_map.get("name") or "").lower()
            content = attr_map.get("content") or ""
            if key and content:
                self.meta[key] = content

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.page_title = normalize_whitespace("".join(self._title_text))
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_text.append(data)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"[ \t\r\f\v]+", " ", text.replace("\xa0", " ")).strip()


def chunk_text(text: str, chunk_size_words: int, chunk_overlap_words: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    step = max(chunk_size_words - chunk_overlap_words, 1)
    for start in range(0, len(words), step):
        window = words[start : start + chunk_size_words]
        if not window:
            continue
        chunks.append(" ".join(window))
        if start + chunk_size_words >= len(words):
            break
    return chunks


def escape_table_cell(value: str) -> str:
    return value.replace("|", "\\|")


def page_meta(page: int | None) -> dict[str, Any]:
    return {"page": page} if page is not None else {}


def _match_heading(line: str) -> str | None:
    if not line.startswith("#"):
        return None
    parts = line.split(maxsplit=1)
    if len(parts) == 2 and 1 <= len(parts[0]) <= 6 and set(parts[0]) == {"#"}:
        return parts[1].strip()
    return None


def _match_list_item(line: str) -> str | None:
    for marker in ("- ", "* ", "+ "):
        if line.startswith(marker):
            return line[len(marker):].strip()
    dot = line.split(maxsplit=1)
    if len(dot) == 2 and dot[0].endswith(".") and dot[0][:-1].isdigit():
        return dot[1].strip()
    return None
