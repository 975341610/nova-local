import time
import os
import asyncio
import inspect
from pathlib import Path

import pytest

from backend.api.routes import cleanup_expired_upload_sessions, upload_media_api, upload_media_chunk, upload_media_complete
from backend.config import get_settings


settings = get_settings()


@pytest.fixture(autouse=True)
def isolate_uploads_path(tmp_path):
    original_data_root = settings.data_root
    settings.data_root = tmp_path / "data"
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    yield
    settings.data_root = original_data_root


def test_cleanup_expired_upload_sessions_removes_old_temp_dirs():
    temp_root = Path(settings.uploads_path) / "temp"
    old_session = temp_root / "old-upload"
    fresh_session = temp_root / "fresh-upload"
    old_session.mkdir(parents=True)
    fresh_session.mkdir(parents=True)
    (old_session / "chunk_0").write_bytes(b"old")
    (fresh_session / "chunk_0").write_bytes(b"fresh")

    old_timestamp = time.time() - (31 * 60)
    fresh_timestamp = time.time()
    for path in (old_session, old_session / "chunk_0"):
        os.utime(path, (old_timestamp, old_timestamp))
    for path in (fresh_session, fresh_session / "chunk_0"):
        os.utime(path, (fresh_timestamp, fresh_timestamp))

    cleanup_expired_upload_sessions()

    assert not old_session.exists()
    assert fresh_session.exists()


def test_upload_media_chunk_uses_async_uploadfile_read():
    asyncio.run(_test_upload_media_chunk_uses_async_uploadfile_read())


async def _test_upload_media_chunk_uses_async_uploadfile_read():
    temp_root = Path(settings.uploads_path) / "temp"
    upload_id = "11111111-1111-4111-8111-111111111111"
    temp_dir = temp_root / upload_id
    temp_dir.mkdir(parents=True)

    class BlockingFile:
        def read(self):
            raise AssertionError("sync file.file.read must not be used")

    class AsyncOnlyUpload:
        file = BlockingFile()

        async def read(self):
            return b"chunk-data"

    response = await upload_media_chunk(upload_id=upload_id, chunk_index=0, file=AsyncOnlyUpload(), chunk_sha256=None)

    assert response == {"status": "ok"}
    assert (temp_dir / "chunk_0").read_bytes() == b"chunk-data"


def test_upload_media_api_uses_async_uploadfile_read():
    asyncio.run(_test_upload_media_api_uses_async_uploadfile_read())


async def _test_upload_media_api_uses_async_uploadfile_read():
    class BlockingFile:
        def read(self):
            raise AssertionError("sync file.file.read must not be used")

    class AsyncOnlyUpload:
        filename = "image.png"
        file = BlockingFile()

        async def read(self):
            return b"image-data"

    response = await upload_media_api(file=AsyncOnlyUpload(), note_id=None)

    assert response["url"].startswith("/api/media/static/files/")
    saved_name = response["url"].rsplit("/", 1)[-1]
    assert (Path(settings.uploads_path) / saved_name).read_bytes() == b"image-data"


def test_upload_media_complete_is_async_and_merges_chunks():
    asyncio.run(_test_upload_media_complete_is_async_and_merges_chunks())


def test_upload_media_complete_does_not_read_final_file_into_memory():
    source = inspect.getsource(upload_media_complete)

    assert "hashlib.sha256(infile.read())" not in source
    assert ".update(" in source


async def _test_upload_media_complete_is_async_and_merges_chunks():
    temp_root = Path(settings.uploads_path) / "temp"
    upload_id = "22222222-2222-4222-8222-222222222222"
    temp_dir = temp_root / upload_id
    temp_dir.mkdir(parents=True)
    (temp_dir / "chunk_1").write_bytes(b"world")
    (temp_dir / "chunk_0").write_bytes(b"hello ")

    response = await upload_media_complete(
        upload_id=upload_id,
        filename="merged.txt",
        content_type="text/plain",
        note_id=None,
        total_chunks=2,
        file_sha256=None,
    )

    saved_name = response["url"].rsplit("/", 1)[-1]
    assert (Path(settings.uploads_path) / saved_name).read_bytes() == b"hello world"
    assert not temp_dir.exists()
