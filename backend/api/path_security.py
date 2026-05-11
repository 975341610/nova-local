from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import HTTPException


_SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _resolved_root(root: str | Path) -> Path:
    return Path(root).resolve()


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def safe_child_path(root: str | Path, relative_path: str | Path, *, detail: str = "Invalid path") -> Path:
    root_path = _resolved_root(root)
    child_path = (root_path / Path(relative_path)).resolve()
    if child_path == root_path or not _is_relative_to(child_path, root_path):
        raise HTTPException(status_code=400, detail=detail)
    return child_path


def safe_media_subdir(root: str | Path, note_id: str | None) -> Path:
    root_path = _resolved_root(root)
    if not note_id:
        return root_path
    if note_id in {".", ".."} or not _SAFE_SEGMENT_RE.fullmatch(note_id):
        raise HTTPException(status_code=400, detail="Invalid note_id")
    return safe_child_path(root_path, note_id, detail="Invalid note_id")


def validate_uuid(value: str, field_name: str) -> str:
    try:
        parsed = uuid.UUID(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}") from None
    return str(parsed)


def safe_named_file(root: str | Path, filename: str, *, detail: str = "Invalid filename") -> Path:
    if filename in {"", ".", ".."} or Path(filename).name != filename:
        raise HTTPException(status_code=400, detail=detail)
    return safe_child_path(root, filename, detail=detail)
