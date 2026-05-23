from __future__ import annotations

import zipfile

import pytest

from ensure_ollama import safe_extract_zip


def test_safe_extract_zip_rejects_zip_slip(tmp_path):
    archive = tmp_path / "ollama.zip"
    with zipfile.ZipFile(archive, "w") as zip_ref:
        zip_ref.writestr("../escape.exe", b"bad")

    with pytest.raises(ValueError, match="Unsafe zip entry"):
        safe_extract_zip(archive, tmp_path / "bin")

    assert not (tmp_path / "escape.exe").exists()
