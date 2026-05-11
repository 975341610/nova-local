from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlparse


ATTACHMENT_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".mov",
    ".pdf",
}

MARKDOWN_LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
HTML_URL_RE = re.compile(r"\b(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.IGNORECASE)
MOJIBAKE_RE = re.compile(r"(?:杩|绋|鐨|涓|锛|�)")


def _rel(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _iter_notes(vault_root: Path):
    if not vault_root.exists():
        return
    for path in vault_root.rglob("*.md"):
        if path.is_file():
            yield path


def _iter_assets(vault_root: Path):
    assets_root = vault_root / "_assets"
    if not assets_root.exists():
        return
    for path in assets_root.rglob("*"):
        if path.is_file() and path.suffix.lower() in ATTACHMENT_EXTENSIONS:
            yield path


def _normalize_attachment_target(raw: str) -> str | None:
    value = raw.strip().strip("\"'")
    if not value or value.startswith("#"):
        return None
    if value.startswith(("data:", "blob:", "http://", "https://")):
        return None

    parsed = urlparse(value)
    path = unquote(parsed.path or value).replace("\\", "/")
    if "/api/media/static/files/" in path:
        path = path.split("/api/media/static/files/", 1)[1]
        return f"_assets/{path.lstrip('/')}"
    if path.startswith("/api/media/files/"):
        path = path.split("/api/media/files/", 1)[1]
        return f"_assets/{path.lstrip('/')}"
    if path.startswith("/"):
        return path.lstrip("/")
    return path


def _resolve_note_reference(vault_root: Path, note_path: Path, target: str) -> Path:
    target_path = Path(target)
    if target.startswith("_assets/"):
        return vault_root / target_path
    return note_path.parent / target_path


def scan_vault_health(vault_root: str | Path) -> dict:
    root = Path(vault_root)
    issues: list[dict] = []
    referenced_assets: set[str] = set()

    for note_path in _iter_notes(root):
        try:
            text = note_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            issues.append({
                "type": "encoding_error",
                "severity": "warning",
                "note_path": _rel(note_path, root),
                "message": "Note cannot be decoded as UTF-8.",
            })
            continue

        if MOJIBAKE_RE.search(text):
            issues.append({
                "type": "mojibake_text",
                "severity": "warning",
                "note_path": _rel(note_path, root),
                "message": "Note contains text that looks like mojibake.",
            })

        raw_targets = [match.group(1) for match in MARKDOWN_LINK_RE.finditer(text)]
        raw_targets.extend(match.group(1) for match in HTML_URL_RE.finditer(text))
        for raw_target in raw_targets:
            target = _normalize_attachment_target(raw_target)
            if not target:
                continue
            candidate = _resolve_note_reference(root, note_path, target)
            if candidate.suffix.lower() not in ATTACHMENT_EXTENSIONS:
                continue
            try:
                relative_candidate = _rel(candidate, root)
            except ValueError:
                issues.append({
                    "type": "unsafe_attachment_reference",
                    "severity": "error",
                    "note_path": _rel(note_path, root),
                    "target": target,
                    "message": "Attachment reference points outside the vault.",
                })
                continue
            referenced_assets.add(relative_candidate)
            if not candidate.exists():
                issues.append({
                    "type": "missing_attachment",
                    "severity": "error",
                    "note_path": _rel(note_path, root),
                    "target": target,
                    "message": "Attachment reference points to a missing file.",
                })

    for asset_path in _iter_assets(root):
        relative_asset = _rel(asset_path, root)
        if relative_asset not in referenced_assets:
            issues.append({
                "type": "orphan_attachment",
                "severity": "info",
                "asset_path": relative_asset,
                "message": "Attachment exists in _assets but is not referenced by any note.",
            })

    summary = {
        "total_issues": len(issues),
        "missing_attachments": sum(1 for issue in issues if issue["type"] == "missing_attachment"),
        "orphan_attachments": sum(1 for issue in issues if issue["type"] == "orphan_attachment"),
        "mojibake_notes": sum(1 for issue in issues if issue["type"] == "mojibake_text"),
        "encoding_errors": sum(1 for issue in issues if issue["type"] == "encoding_error"),
        "unsafe_references": sum(1 for issue in issues if issue["type"] == "unsafe_attachment_reference"),
    }
    return {"summary": summary, "issues": issues}
