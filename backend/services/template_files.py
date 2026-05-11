from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol


class TemplateLike(Protocol):
    id: int
    name: str
    content: str
    icon: str
    category: str


_UNSAFE_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe_segment(value: str, fallback: str) -> str:
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", (value or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned or fallback


def template_file_path(vault_root: str | Path, template: TemplateLike) -> Path:
    category = _safe_segment(template.category, "general")
    name = _safe_segment(template.name, "template")
    return Path(vault_root) / "_templates" / category / f"{template.id:05d}-{name}.md"


def mirror_template_to_vault(vault_root: str | Path, template: TemplateLike) -> Path:
    path = template_file_path(vault_root, template)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = (
        "---\n"
        f"id: {template.id}\n"
        f"name: {template.name}\n"
        f"icon: {template.icon}\n"
        f"category: {template.category}\n"
        "type: nova-template\n"
        "---\n\n"
        f"{template.content or ''}"
    )
    path.write_text(body, encoding="utf-8")
    return path


def delete_template_file(vault_root: str | Path, template_id: int) -> bool:
    templates_root = Path(vault_root) / "_templates"
    if not templates_root.exists():
        return False
    deleted = False
    prefix = f"{template_id:05d}-"
    for path in templates_root.rglob(f"{prefix}*.md"):
        if path.is_file():
            path.unlink()
            deleted = True
    return deleted
