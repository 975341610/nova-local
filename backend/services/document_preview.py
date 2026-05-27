from __future__ import annotations

import html
import re
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from pypdf import PdfReader

from backend.config import get_settings


PREVIEWABLE_EXTENSIONS = {".pdf", ".md", ".markdown", ".docx"}


def _uploads_root() -> Path:
    return Path(get_settings().uploads_path).resolve()


def resolve_media_file(src: str) -> Path:
    """Resolve an uploaded media URL to a local file inside the vault assets dir."""
    value = (src or "").strip().replace("\\", "/")
    if not value:
        raise ValueError("Missing document src")

    for marker in ("/api/media/static/files/", "/api/media/files/"):
        if marker in value:
            value = value.split(marker, 1)[1]
            break
    else:
        raise ValueError("Only uploaded Nova media files can be previewed")

    value = value.split("?", 1)[0].split("#", 1)[0].lstrip("/")
    if not value or ".." in Path(value).parts:
        raise ValueError("Invalid document path")

    root = _uploads_root()
    path = (root / value).resolve()
    if path != root and root not in path.parents:
        raise ValueError("Document path escapes the media directory")
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(value)
    return path


def preview_document(src: str, name: str | None = None) -> dict[str, Any]:
    path = resolve_media_file(src)
    ext = path.suffix.lower()
    title = name or path.name
    if ext not in PREVIEWABLE_EXTENSIONS:
        return {
            "kind": "unsupported",
            "title": title,
            "extension": ext.lstrip("."),
            "can_preview": False,
            "page_count": None,
            "sections": [],
            "html": "",
        }

    if ext == ".pdf":
        page_count = _read_pdf_page_count(path)
        return {
            "kind": "pdf",
            "title": title,
            "extension": "pdf",
            "can_preview": True,
            "page_count": page_count,
            "sections": [{"title": f"第 {i} 页", "page": i} for i in range(1, page_count + 1)],
            "html": "",
        }

    if ext in {".md", ".markdown"}:
        text = path.read_text(encoding="utf-8", errors="replace")
        html_text, sections = _markdown_to_html(text)
        return {
            "kind": "markdown",
            "title": title,
            "extension": ext.lstrip("."),
            "can_preview": True,
            "page_count": None,
            "sections": sections,
            "html": html_text,
        }

    html_text, sections = _docx_to_html(path)
    return {
        "kind": "docx",
        "title": title,
        "extension": "docx",
        "can_preview": True,
        "page_count": None,
        "sections": sections,
        "html": html_text,
    }


def _read_pdf_page_count(path: Path) -> int:
    reader = PdfReader(str(path))
    return max(1, len(reader.pages))


def _markdown_to_html(text: str) -> tuple[str, list[dict[str, Any]]]:
    blocks: list[str] = []
    sections: list[dict[str, Any]] = []
    in_code = False
    code_lines: list[str] = []
    list_items: list[str] = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append("<ul>" + "".join(list_items) + "</ul>")
            list_items = []

    def flush_code() -> None:
        nonlocal code_lines
        if code_lines:
            blocks.append(f"<pre><code>{html.escape(chr(10).join(code_lines))}</code></pre>")
            code_lines = []

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if line.strip().startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                flush_list()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not line.strip():
            flush_list()
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            flush_list()
            level = min(6, len(heading.group(1)))
            title = _inline_markdown_to_text(heading.group(2))
            sections.append({"title": title, "level": level})
            blocks.append(f"<h{level}>{html.escape(title)}</h{level}>")
            continue

        bullet = re.match(r"^\s*[-*+]\s+(.+)$", line)
        if bullet:
            list_items.append(f"<li>{_inline_markdown_to_html(bullet.group(1))}</li>")
            continue

        quote = re.match(r"^\s*>\s?(.+)$", line)
        if quote:
            flush_list()
            blocks.append(f"<blockquote>{_inline_markdown_to_html(quote.group(1))}</blockquote>")
            continue

        flush_list()
        blocks.append(f"<p>{_inline_markdown_to_html(line)}</p>")

    flush_list()
    if in_code:
        flush_code()
    return "\n".join(blocks), sections


def _inline_markdown_to_text(value: str) -> str:
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = re.sub(r"[*_]{1,2}([^*_]+)[*_]{1,2}", r"\1", value)
    return value.strip()


def _inline_markdown_to_html(value: str) -> str:
    escaped = html.escape(value)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
    return escaped


def _docx_to_html(path: Path) -> tuple[str, list[dict[str, Any]]]:
    with zipfile.ZipFile(path) as archive:
        xml_bytes = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml_bytes)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    blocks: list[str] = []
    sections: list[dict[str, Any]] = []

    for child in root.findall(".//w:body/*", ns):
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = _docx_text(child, ns)
            if not text:
                continue
            style = child.find(".//w:pStyle", ns)
            style_val = style.attrib.get(f"{{{ns['w']}}}val", "") if style is not None else ""
            heading_match = re.match(r"Heading([1-6])", style_val, re.I)
            if heading_match:
                level = int(heading_match.group(1))
                sections.append({"title": text, "level": level})
                blocks.append(f"<h{level}>{html.escape(text)}</h{level}>")
            else:
                blocks.append(f"<p>{html.escape(text)}</p>")
        elif tag == "tbl":
            rows: list[str] = []
            for row in child.findall(".//w:tr", ns):
                cells = [f"<td>{html.escape(_docx_text(cell, ns))}</td>" for cell in row.findall("./w:tc", ns)]
                rows.append("<tr>" + "".join(cells) + "</tr>")
            if rows:
                blocks.append("<table><tbody>" + "".join(rows) + "</tbody></table>")

    return "\n".join(blocks), sections


def _docx_text(element: ElementTree.Element, ns: dict[str, str]) -> str:
    parts = [node.text or "" for node in element.findall(".//w:t", ns)]
    return " ".join(part.strip() for part in parts if part.strip()).strip()
