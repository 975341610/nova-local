from __future__ import annotations
import pytest
from fastapi.testclient import TestClient
from backend.main import (
    DESKTOP_ONLY_API_PATHS,
    PROTECTED_API_PATHS,
    app,
    get_settings,
    is_desktop_only_api_path,
    is_protected_api_path,
    validate_runtime_security,
)

client = TestClient(app)

def test_auth_middleware_disabled():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = ""
    try:
        # 使用 /health 路径测试，因为它不依赖数据库
        response = client.get("/health")
        assert response.status_code == 200
    finally:
        settings.access_token = original_token

def test_auth_middleware_enabled_no_token():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        # 使用 /api/health 如果它存在，或者直接测试 /api 下的任意路径
        # 由于我们只想测试中间件，401 优先级高于路由逻辑
        response = client.get("/api/non-existent")
        assert response.status_code == 401
        assert response.json()["detail"] == "Unauthorized: Invalid or missing access token"
    finally:
        settings.access_token = original_token

def test_auth_middleware_enabled_correct_header_token():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = client.get(
            "/health",
            headers={"Authorization": "Bearer test-token"}
        )
        assert response.status_code == 200
    finally:
        settings.access_token = original_token

def test_auth_middleware_enabled_correct_cookie_token():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        with TestClient(app) as cookie_client:
            cookie_client.cookies.set("access_token", "test-token")
            response = cookie_client.get("/health")
        assert response.status_code == 200
    finally:
        settings.access_token = original_token

def test_auth_middleware_enabled_wrong_token():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = client.get(
            "/api/non-existent",
            headers={"Authorization": "Bearer wrong-token"}
        )
        assert response.status_code == 401
    finally:
        settings.access_token = original_token

def test_auth_middleware_exempt_paths():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        # /health 应该豁免
        response = client.get("/health")
        assert response.status_code == 200
        
        # 静态文件（非 /api）应该豁免
        response = client.get("/")
        assert response.status_code != 401
    finally:
        settings.access_token = original_token


def test_revision_auth_exemption_requires_exact_revision_route():
    settings = get_settings()
    original_token = settings.access_token
    settings.access_token = "test-token"
    try:
        response = client.get("/api/notes/1/revisions-bypass")
    finally:
        settings.access_token = original_token

    assert response.status_code == 401


def test_server_mode_requires_access_token():
    settings = get_settings()
    original_mode = settings.run_mode
    original_token = settings.access_token
    settings.run_mode = "server_mode"
    settings.access_token = ""
    try:
        with pytest.raises(RuntimeError, match="ACCESS_TOKEN"):
            validate_runtime_security()
    finally:
        settings.run_mode = original_mode
        settings.access_token = original_token


def test_privileged_api_paths_are_explicitly_classified():
    assert "/api/system/switch-data-path" in DESKTOP_ONLY_API_PATHS
    assert "/api/system/update" in DESKTOP_ONLY_API_PATHS
    assert "/api/system/restart" in DESKTOP_ONLY_API_PATHS
    assert "/api/system/open-file" in DESKTOP_ONLY_API_PATHS
    assert "/api/system/import-data" in DESKTOP_ONLY_API_PATHS
    assert "/api/ai/update-ollama" in DESKTOP_ONLY_API_PATHS

    assert "/api/system/version" not in PROTECTED_API_PATHS
    assert "/api/model-config" in PROTECTED_API_PATHS
    assert "/api/ai/toggle" in PROTECTED_API_PATHS
    assert "/api/ai/toggle-plugin" in PROTECTED_API_PATHS


def test_privileged_api_path_helpers_cover_prefix_groups():
    assert is_desktop_only_api_path("/api/system/open-file")
    assert is_desktop_only_api_path("/api/ai/update-ollama")
    assert is_protected_api_path("/api/system/logs")
    assert not is_protected_api_path("/api/system/vault-health")
    assert is_protected_api_path("/api/ai/toggle-plugin")
    assert not is_protected_api_path("/api/system/version")
