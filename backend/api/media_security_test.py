from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.main import app


client = TestClient(app)


@pytest.fixture()
def isolated_data_root(tmp_path: Path):
    settings = get_settings()
    original_data_root = settings.data_root
    settings.data_root = tmp_path / "data"
    settings.data_root.mkdir(parents=True, exist_ok=True)
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    Path(settings.stickers_path).mkdir(parents=True, exist_ok=True)
    Path(settings.emoticons_path).mkdir(parents=True, exist_ok=True)
    yield settings.data_root
    settings.data_root = original_data_root


def test_media_upload_rejects_note_id_path_traversal(isolated_data_root: Path):
    response = client.post(
        "/api/media/upload",
        data={"note_id": "../escape"},
        files={"file": ("image.png", b"image", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid note_id"
    assert not (isolated_data_root.parent / "escape").exists()


def test_bgm_stream_rejects_path_like_filename(isolated_data_root: Path):
    response = client.get("/api/bgm/stream/..%2Fsecret.mp3")

    assert response.status_code in {400, 404}
    if response.status_code == 400:
        assert "Invalid" in response.json()["detail"]
