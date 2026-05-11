from __future__ import annotations

import json
import re
from datetime import date
from typing import Any


REQUIRED_NOTE_SECTIONS = (
    "## 摘要",
    "## 核心要点",
    "## 详细整理",
    "## 待办 / 后续行动",
    "## 引用资料",
)

TEMPLATE_INSTRUCTIONS = {
    "general": "Organize as a reusable structured knowledge note.",
    "meeting": "Organize as meeting minutes with decisions, discussion points, owners, and follow-up actions.",
    "study": "Organize as a study note with concepts, examples, memory hooks, and review questions.",
    "paper": "Organize as a paper or long-form reading note with thesis, method, evidence, limitations, and takeaways.",
    "table": "Organize as a table or data summary with key fields, trends, anomalies, and interpretation.",
    "video": "Organize as a video note with source metadata, one-sentence summary, core points, timeline, actions, and tags.",
}


def build_structured_note_prompt(normalized_content: dict[str, Any]) -> list[dict[str, str]]:
    title = str(normalized_content.get("title") or "Untitled Import").strip() or "Untitled Import"
    source_type = str(normalized_content.get("source_type") or "unknown")
    plain_text = str(normalized_content.get("plain_text") or "").strip()
    blocks = normalized_content.get("blocks") if isinstance(normalized_content.get("blocks"), list) else []
    metadata = normalized_content.get("metadata") if isinstance(normalized_content.get("metadata"), dict) else {}
    template_id = str(metadata.get("template_id") or "general")
    template_instruction = TEMPLATE_INSTRUCTIONS.get(template_id, TEMPLATE_INSTRUCTIONS["general"])

    compact_blocks = []
    for block in blocks[:80]:
        if not isinstance(block, dict):
            continue
        text = str(block.get("text") or "").strip()
        if not text:
            continue
        compact_blocks.append(
            {
                "type": str(block.get("type") or "paragraph"),
                "text": text[:1200],
                "metadata": block.get("metadata") if isinstance(block.get("metadata"), dict) else {},
            }
        )

    system_prompt = "\n".join(
        [
            "You are Nova's note generation assistant.",
            "Turn imported content into a complete, well-structured knowledge note.",
            "Return only clean Markdown that can be inserted into a note editor.",
            "Do not wrap the whole answer in a Markdown code fence.",
            "Use these exact second-level section headings:",
            *REQUIRED_NOTE_SECTIONS,
            f"Template instruction: {template_instruction}",
            "For video imports, prefer this structure: ## 视频：标题, source metadata bullets, ### 一句话总结, ### 核心要点, ### 时间线, ### 可执行行动, ### 标签, and ## 引用资料.",
            "Keep facts grounded in the provided content.",
            "Preserve source file names when summarizing facts.",
            "Always include the ## 引用资料 section. For URL sources, include the source title and full URL. For local files, include the file name and source title.",
            "If action items are absent, write '- 暂无明确后续行动'.",
        ]
    )
    user_payload = {
        "title": title,
        "source_type": source_type,
        "metadata": metadata,
        "plain_text": plain_text[:12000],
        "blocks": compact_blocks,
    }
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False, indent=2)},
    ]


def generate_fallback_structured_note(normalized_content: dict[str, Any]) -> dict[str, Any]:
    title = str(normalized_content.get("title") or "Untitled Import").strip() or "Untitled Import"
    source_type = str(normalized_content.get("source_type") or "unknown")
    metadata = normalized_content.get("metadata") if isinstance(normalized_content.get("metadata"), dict) else {}
    blocks = normalized_content.get("blocks") if isinstance(normalized_content.get("blocks"), list) else []
    plain_text = str(normalized_content.get("plain_text") or "").strip()

    summary = _first_non_empty_text(blocks) or plain_text[:240] or "暂无可整理内容。"
    key_points = _collect_key_points(blocks, plain_text)
    detail_lines = _collect_detail_lines(blocks, plain_text)
    actions = _collect_action_lines(blocks)
    reference_lines = _build_reference_lines(metadata)
    if _is_video_note(metadata):
        return _generate_video_fallback_note(title, source_type, metadata, summary, key_points, actions, reference_lines, plain_text)

    markdown_lines = [
        f"# {title}",
        "",
        "## 摘要",
        summary,
        "",
        "## 核心要点",
        *(f"- {point}" for point in key_points),
        "",
        "## 详细整理",
        *detail_lines,
        "",
        "## 待办 / 后续行动",
        *(f"- {action}" for action in actions),
        "",
        "## 引用资料",
        *reference_lines,
    ]

    return {
        "title": title,
        "markdown": "\n".join(markdown_lines).strip() + "\n",
        "source_type": source_type,
        "metadata": metadata,
    }


async def generate_structured_note(
    normalized_content: dict[str, Any],
    ai_client: Any,
    llm_config: dict[str, str] | None,
) -> dict[str, Any]:
    if not _has_remote_config(llm_config):
        return generate_fallback_structured_note(normalized_content)

    messages = build_structured_note_prompt(normalized_content)
    chunks: list[str] = []
    try:
        async for chunk in ai_client.stream_chat(messages, llm_config):
            text = _extract_stream_text(chunk)
            if text:
                chunks.append(text)
    except Exception:
        return generate_fallback_structured_note(normalized_content)

    markdown = "".join(chunks).strip()
    if not markdown or markdown.startswith("Error:"):
        return generate_fallback_structured_note(normalized_content)

    title = str(normalized_content.get("title") or "Untitled Import").strip() or "Untitled Import"
    source_type = str(normalized_content.get("source_type") or "unknown")
    metadata = normalized_content.get("metadata") if isinstance(normalized_content.get("metadata"), dict) else {}
    markdown = _ensure_reference_section(markdown, metadata)
    if _is_video_note(metadata):
        markdown = _ensure_video_note_shape(markdown, title, metadata)
    return {
        "title": title,
        "markdown": markdown,
        "source_type": source_type,
        "metadata": metadata,
    }


def _has_remote_config(llm_config: dict[str, str] | None) -> bool:
    return bool(llm_config and llm_config.get("api_key") and llm_config.get("base_url"))


def _extract_stream_text(chunk: Any) -> str:
    if not isinstance(chunk, str):
        return ""
    stripped = chunk.strip()
    if not stripped.startswith("data:"):
        return chunk
    payload = stripped.removeprefix("data:").strip()
    if not payload or payload == "[DONE]":
        return ""
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return ""
    if parsed.get("error"):
        return ""
    return str(parsed.get("text") or "")


def _first_non_empty_text(blocks: list[Any]) -> str:
    for block in blocks:
        if isinstance(block, dict):
            text = str(block.get("text") or "").strip()
            if text:
                return text
    return ""


def _collect_key_points(blocks: list[Any], plain_text: str) -> list[str]:
    points: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        text = str(block.get("text") or "").strip()
        if not text:
            continue
        if block.get("type") in {"heading", "list", "table"}:
            for line in text.splitlines():
                cleaned = line.strip(" -\t")
                if cleaned:
                    points.append(cleaned[:180])
        if len(points) >= 6:
            break
    if not points and plain_text:
        points = [line.strip()[:180] for line in plain_text.splitlines() if line.strip()][:6]
    return points or ["暂无明确要点。"]


def _collect_detail_lines(blocks: list[Any], plain_text: str) -> list[str]:
    lines: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        text = str(block.get("text") or "").strip()
        if not text:
            continue
        block_type = str(block.get("type") or "paragraph")
        if block_type == "heading":
            lines.extend([f"### {text}", ""])
        elif block_type == "list":
            lines.extend(f"- {item.strip()}" for item in text.splitlines() if item.strip())
            lines.append("")
        elif block_type == "table":
            lines.extend([text, ""])
        else:
            lines.extend([text, ""])
    if not lines and plain_text:
        lines = [plain_text]
    return lines or ["暂无详细内容。"]


def _collect_action_lines(blocks: list[Any]) -> list[str]:
    action_keywords = ("todo", "待办", "行动", "后续", "下一步", "修复", "补充", "完成", "整理")
    actions: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        text = str(block.get("text") or "")
        for line in text.splitlines():
            cleaned = line.strip(" -\t")
            if cleaned and any(keyword in cleaned.lower() for keyword in action_keywords):
                actions.append(cleaned[:180])
            if len(actions) >= 6:
                return actions
    return actions or ["暂无明确后续行动"]


def _build_reference_lines(metadata: dict[str, Any]) -> list[str]:
    source_refs = metadata.get("source_refs")
    lines: list[str] = []
    if isinstance(source_refs, list):
        for ref in source_refs:
            if not isinstance(ref, dict):
                continue
            kind = str(ref.get("kind") or "").strip()
            title = str(ref.get("title") or "").strip()
            name = str(ref.get("name") or "").strip()
            url = str(ref.get("url") or "").strip()
            if url:
                label = title or name or url
                prefix = "视频" if kind == "video" else "链接"
                lines.append(f"- {prefix}: [{label}]({url})")
            elif name:
                label = title or name
                suffix = f"（{label}）" if label != name else ""
                lines.append(f"- 本地文件: {name}{suffix}")
    if lines:
        return lines

    source_urls = metadata.get("source_urls")
    if isinstance(source_urls, list):
        lines.extend(f"- 链接: {url}" for url in source_urls if isinstance(url, str) and url.strip())

    source_names = metadata.get("source_names")
    if isinstance(source_names, list):
        lines.extend(f"- 本地文件: {name}" for name in source_names if isinstance(name, str) and name.strip())

    source_name = metadata.get("source_name")
    if isinstance(source_name, str) and source_name.strip():
        lines.append(f"- 本地文件: {source_name.strip()}")

    source_url = metadata.get("source_url")
    if isinstance(source_url, str) and source_url.strip():
        lines.append(f"- 链接: {source_url.strip()}")

    return lines or ["- 暂无可追溯来源"]


def _is_video_note(metadata: dict[str, Any]) -> bool:
    if str(metadata.get("template_id") or "").lower() == "video":
        return True
    source_refs = metadata.get("source_refs")
    return isinstance(source_refs, list) and any(
        isinstance(ref, dict) and str(ref.get("kind") or "").lower() == "video"
        for ref in source_refs
    )


def _first_source_ref(metadata: dict[str, Any]) -> dict[str, Any]:
    source_refs = metadata.get("source_refs")
    if isinstance(source_refs, list):
        for ref in source_refs:
            if isinstance(ref, dict):
                return ref
    return {}


def _extract_author(plain_text: str) -> str:
    for line in plain_text.splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        for prefix in ("- uploader:", "- author:", "- 作者：", "- 作者:"):
            if lower.startswith(prefix.lower()):
                return stripped.split(":", 1)[-1].strip() if ":" in stripped else stripped.split("：", 1)[-1].strip()
    return "未知"


def _collect_timeline_lines(plain_text: str) -> list[str]:
    timeline: list[str] = []
    for line in plain_text.splitlines():
        stripped = line.strip(" -\t")
        if stripped and re.match(r"^\d{1,2}:\d{2}(?::\d{2})?\s+", stripped):
            timeline.append(stripped[:180])
        if len(timeline) >= 8:
            break
    return timeline or ["暂无可用时间线"]


def _generate_video_fallback_note(
    title: str,
    source_type: str,
    metadata: dict[str, Any],
    summary: str,
    key_points: list[str],
    actions: list[str],
    reference_lines: list[str],
    plain_text: str,
) -> dict[str, Any]:
    ref = _first_source_ref(metadata)
    url = str(ref.get("url") or metadata.get("source_url") or "").strip()
    author = str(ref.get("author") or "").strip() or _extract_author(plain_text)
    timeline = _collect_timeline_lines(plain_text)
    markdown_lines = [
        f"# {title}",
        "",
        f"## 视频：{title}",
        f"- 来源：{url or '未知'}",
        f"- 作者：{author}",
        f"- 总结时间：{date.today().isoformat()}",
        "",
        "### 一句话总结",
        summary,
        "",
        "### 核心要点",
        *(f"{index + 1}. {point}" for index, point in enumerate(key_points[:6])),
        "",
        "### 时间线",
        *(f"- {line}" for line in timeline),
        "",
        "### 可执行行动",
        *(f"- {action}" for action in actions),
        "",
        "### 标签",
        "#视频笔记 #AI总结",
        "",
        "## 引用资料",
        *reference_lines,
    ]
    return {
        "title": title,
        "markdown": "\n".join(markdown_lines).strip() + "\n",
        "source_type": source_type,
        "metadata": metadata,
    }


def _ensure_video_note_shape(markdown: str, title: str, metadata: dict[str, Any]) -> str:
    if "## 视频：" in markdown and "### 一句话总结" in markdown:
        return markdown.strip() + "\n"
    ref = _first_source_ref(metadata)
    url = str(ref.get("url") or metadata.get("source_url") or "").strip()
    intro = "\n".join([
        f"## 视频：{title}",
        f"- 来源：{url or '未知'}",
        "- 作者：未知",
        f"- 总结时间：{date.today().isoformat()}",
        "",
    ])
    return markdown.replace("\n## 摘要", f"\n{intro}\n### 一句话总结", 1).strip() + "\n"


def _ensure_reference_section(markdown: str, metadata: dict[str, Any]) -> str:
    if "## 引用资料" in markdown:
        return markdown.strip() + "\n"
    return (markdown.rstrip() + "\n\n## 引用资料\n" + "\n".join(_build_reference_lines(metadata))).strip() + "\n"

