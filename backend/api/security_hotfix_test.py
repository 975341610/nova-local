from __future__ import annotations

import subprocess
import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api import routes
from backend.config import get_settings
from backend.main import app
from backend.models.db_models import Base
from backend.services.repositories import update_model_config


@pytest.fixture()
def isolated_model_config_db(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[routes.get_db] = override_get_db
    try:
        yield TestingSessionLocal
    finally:
        app.dependency_overrides.pop(routes.get_db, None)
        engine.dispose()


def test_model_config_get_masks_api_key_and_omits_plaintext(isolated_model_config_db):
    with isolated_model_config_db() as db:
        update_model_config(db, "openai", "sk-test-secret-1234", "https://api.example.com/v1", "gpt-test")

    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = TestClient(app).get("/api/model-config", headers={"Authorization": "Bearer test-token"})
    finally:
        settings.access_token = original_token

    assert response.status_code == 200
    body = response.json()
    assert body["api_key_masked"] == "sk-****1234"
    assert "api_key" not in body
    assert "sk-test-secret-1234" not in response.text


def test_model_config_post_without_api_key_preserves_existing_secret(isolated_model_config_db):
    with isolated_model_config_db() as db:
        update_model_config(db, "openai", "sk-original-1234", "https://api.example.com/v1", "gpt-test")

    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = TestClient(app).post(
            "/api/model-config",
            headers={"Authorization": "Bearer test-token"},
            json={
                "provider": "openai",
                "api_key": "",
                "base_url": "https://api2.example.com/v1",
                "model_name": "gpt-next",
            },
        )
    finally:
        settings.access_token = original_token

    assert response.status_code == 200
    assert response.json()["api_key_masked"] == "sk-****1234"


def test_model_config_requires_auth_when_token_is_configured(isolated_model_config_db):
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = TestClient(app).get("/api/model-config")
    finally:
        settings.access_token = original_token

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("post", "/api/system/switch-data-path", {"data_path": "C:/tmp/nova-data"}),
        ("post", "/api/system/update", {}),
        ("post", "/api/system/restart", {}),
        ("post", "/api/system/open-file", {"path": "note.md"}),
        ("post", "/api/system/import-data", {"source_path": "C:/tmp/nova-import"}),
    ],
)
def test_destructive_system_routes_reject_bearer_token_without_desktop_token(method: str, path: str, payload: dict):
    settings = get_settings()
    original_token = settings.access_token
    original_desktop_token = settings.desktop_local_token
    settings.access_token = "test-token"
    settings.desktop_local_token = "desktop-token"
    try:
        response = getattr(TestClient(app), method)(
            path,
            headers={"Authorization": "Bearer test-token"},
            json=payload,
        )
    finally:
        settings.access_token = original_token
        settings.desktop_local_token = original_desktop_token

    assert response.status_code == 403


def test_destructive_system_routes_allow_loopback_desktop_token():
    settings = get_settings()
    original_token = settings.access_token
    original_desktop_token = settings.desktop_local_token
    settings.access_token = "test-token"
    settings.desktop_local_token = "desktop-token"
    try:
        response = TestClient(app).post(
            "/api/system/open-file",
            headers={"x-nova-desktop-token": "desktop-token"},
            json={"path": "missing.txt"},
        )
    finally:
        settings.access_token = original_token
        settings.desktop_local_token = original_desktop_token

    assert response.status_code == 404


def test_system_open_file_rejects_absolute_path_outside_allowed_roots(tmp_path: Path):
    outside_file = tmp_path / "outside.txt"
    outside_file.write_text("secret", encoding="utf-8")

    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = TestClient(app).post(
            "/api/system/open-file",
            headers={"Authorization": "Bearer test-token"},
            json={"path": str(outside_file)},
        )
    finally:
        settings.access_token = original_token

    assert response.status_code == 403


def test_system_restart_does_not_use_shell(monkeypatch, tmp_path: Path):
    bat_path = tmp_path / "fast_update.bat"
    bat_path.write_text("@echo off\n", encoding="utf-8")
    popen_calls = []

    monkeypatch.setattr(routes, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: popen_calls.append((args, kwargs)))

    response = asyncio.run(routes.system_restart())

    assert response["status"] == "ok"
    assert popen_calls
    assert popen_calls[0][1].get("shell") is not True
