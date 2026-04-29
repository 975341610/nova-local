import os
import shutil
import pytest
import sqlite3
from pathlib import Path
from fastapi.testclient import TestClient
import backend.api.routes as routes
from backend.main import app
from backend.config import get_settings

client = TestClient(app)
settings = get_settings()
AUTH_HEADERS = {"x-nova-desktop-token": "desktop-token"}


@pytest.fixture(autouse=True)
def isolate_data_root(tmp_path):
    original_data_root = settings.data_root
    original_access_token = settings.access_token
    original_desktop_token = settings.desktop_local_token
    settings.data_root = tmp_path / "active_data"
    settings.access_token = "test-token"
    settings.desktop_local_token = "desktop-token"
    settings.data_root.mkdir(parents=True, exist_ok=True)
    yield
    settings.data_root = original_data_root
    settings.access_token = original_access_token
    settings.desktop_local_token = original_desktop_token


def create_sqlite_database(path: Path):
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE marker (id INTEGER PRIMARY KEY)")
        conn.commit()


def create_named_sqlite_database(path: Path, table_name: str):
    with sqlite3.connect(path) as conn:
        conn.execute(f"CREATE TABLE {table_name} (id INTEGER PRIMARY KEY)")
        conn.commit()


def sqlite_table_exists(path: Path, table_name: str) -> bool:
    with sqlite3.connect(path) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        ).fetchone()
    return row is not None

@pytest.fixture
def mock_source_data(tmp_path):
    # Setup source data directory
    source_dir = tmp_path / "source_data"
    source_dir.mkdir()
    
    create_sqlite_database(source_dir / "second_brain.db")
    
    # Create mock chroma_store
    (source_dir / "chroma_store").mkdir()
    (source_dir / "chroma_store" / "data.bin").write_text("dummy chroma content")
    
    # Create mock vault, including V4 assets.
    (source_dir / "vault" / "Notes").mkdir(parents=True)
    (source_dir / "vault" / "Notes" / "note.md").write_text("dummy note content")
    (source_dir / "vault" / "_assets").mkdir()
    (source_dir / "vault" / "_assets" / "file.txt").write_text("dummy asset content")
    
    return source_dir

def test_import_data_success(mock_source_data):
    # Call import-data endpoint
    response = client.post("/api/system/import-data", headers=AUTH_HEADERS, json={"source_path": str(mock_source_data)})
    
    # Verify response
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    
    # Verify files were copied to settings.data_root
    data_root = settings.data_root
    assert (data_root / "second_brain.db").exists()
    assert (data_root / "chroma_store" / "data.bin").exists()
    assert (data_root / "vault" / "Notes" / "note.md").exists()
    assert (data_root / "vault" / "_assets" / "file.txt").exists()
    assert not (data_root / "uploads").exists()


def test_import_data_restores_existing_data_when_copy_fails(mock_source_data, monkeypatch):
    data_root = settings.data_root
    create_named_sqlite_database(data_root / "second_brain.db", "active_marker")
    (data_root / "chroma_store").mkdir()
    (data_root / "chroma_store" / "data.bin").write_text("active chroma")
    (data_root / "vault" / "Notes").mkdir(parents=True)
    (data_root / "vault" / "Notes" / "note.md").write_text("active note")
    (data_root / "vault" / "_assets").mkdir()
    (data_root / "vault" / "_assets" / "file.txt").write_text("active asset")

    original_copytree = routes.shutil.copytree

    def fail_on_chroma_store(src, dst, *args, **kwargs):
        if Path(src).name == "chroma_store":
            raise OSError("simulated chroma copy failure")
        return original_copytree(src, dst, *args, **kwargs)

    monkeypatch.setattr(routes.shutil, "copytree", fail_on_chroma_store)

    response = client.post("/api/system/import-data", headers=AUTH_HEADERS, json={"source_path": str(mock_source_data)})

    assert response.status_code == 500
    assert sqlite_table_exists(data_root / "second_brain.db", "active_marker")
    assert (data_root / "chroma_store" / "data.bin").read_text() == "active chroma"
    assert (data_root / "vault" / "Notes" / "note.md").read_text() == "active note"
    assert (data_root / "vault" / "_assets" / "file.txt").read_text() == "active asset"

def test_import_data_invalid_path():
    # Call import-data endpoint with invalid path
    response = client.post("/api/system/import-data", headers=AUTH_HEADERS, json={"source_path": "/non/existent/path"})
    
    # Verify response
    assert response.status_code == 400
    assert "Invalid source path" in response.json()["detail"]

def test_import_data_missing_db(tmp_path):
    # Call import-data endpoint with path missing second_brain.db
    empty_dir = tmp_path / "empty_dir"
    empty_dir.mkdir()
    response = client.post("/api/system/import-data", headers=AUTH_HEADERS, json={"source_path": str(empty_dir)})
    
    # Verify response
    assert response.status_code == 400
    assert "second_brain.db not found" in response.json()["detail"]

def test_import_data_same_path():
    # Call import-data endpoint with source_path == data_root
    data_root = settings.data_root.resolve()
    # Ensure data_root exists and contains second_brain.db for validation to pass
    data_root.mkdir(parents=True, exist_ok=True)
    create_sqlite_database(data_root / "second_brain.db")
    
    response = client.post("/api/system/import-data", headers=AUTH_HEADERS, json={"source_path": str(data_root)})
    
    # Verify response
    assert response.status_code == 400
    assert "选择的导入目录与当前数据目录相同，无需导入" in response.json()["detail"]
