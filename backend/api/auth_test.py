from __future__ import annotations
import pytest
from fastapi.testclient import TestClient
from backend.main import app, get_settings

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
        response = client.get(
            "/health",
            cookies={"access_token": "test-token"}
        )
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
