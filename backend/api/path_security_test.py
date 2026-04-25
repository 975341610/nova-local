from pathlib import Path

import pytest
from fastapi import HTTPException

from backend.api.path_security import (
    safe_child_path,
    safe_media_subdir,
    validate_uuid,
)


def test_safe_child_path_accepts_nested_file_inside_root(tmp_path: Path):
    root = tmp_path / "vault"

    result = safe_child_path(root, "note-1/image.png")

    assert result == root.resolve() / "note-1" / "image.png"


def test_safe_child_path_rejects_parent_traversal(tmp_path: Path):
    root = tmp_path / "vault"

    with pytest.raises(HTTPException) as exc:
        safe_child_path(root, "../outside.png")

    assert exc.value.status_code == 400
    assert "Invalid path" in exc.value.detail


def test_safe_media_subdir_rejects_path_like_note_id(tmp_path: Path):
    root = tmp_path / "_assets"

    with pytest.raises(HTTPException) as exc:
        safe_media_subdir(root, "../other")

    assert exc.value.status_code == 400
    assert "Invalid note_id" in exc.value.detail


def test_validate_uuid_rejects_path_traversal_text():
    with pytest.raises(HTTPException) as exc:
        validate_uuid("../../temp", "upload_id")

    assert exc.value.status_code == 400
    assert "Invalid upload_id" in exc.value.detail
