import asyncio
import pytest
import json
import socket
from unittest.mock import AsyncMock, patch
from backend.services.ai_client import AIClient
import httpx


def test_ai_client_verifies_tls_by_default(monkeypatch):
    created_clients = []

    class DummyAsyncClient:
        def __init__(self, **kwargs):
            created_clients.append(kwargs)

    monkeypatch.delenv("ALLOW_INSECURE_TLS", raising=False)
    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)

    AIClient()

    assert created_clients[0]["verify"] is True


def test_ai_client_allows_explicit_insecure_tls(monkeypatch):
    created_clients = []

    class DummyAsyncClient:
        def __init__(self, **kwargs):
            created_clients.append(kwargs)

    monkeypatch.setenv("ALLOW_INSECURE_TLS", "true")
    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)

    AIClient()

    assert created_clients[0]["verify"] is False


def test_connectivity_check_caches_result_for_same_base_url(monkeypatch):
    asyncio.run(_test_connectivity_check_caches_result_for_same_base_url(monkeypatch))


async def _test_connectivity_check_caches_result_for_same_base_url(monkeypatch):
    calls = {"dns": 0, "tcp": 0}

    def fake_getaddrinfo(host, port):
        calls["dns"] += 1
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", port))]

    class FakeSocket:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_create_connection(address, timeout):
        calls["tcp"] += 1
        return FakeSocket()

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(socket, "create_connection", fake_create_connection)

    client = AIClient()

    assert await client._check_connectivity("https://api.example.com/v1") is None
    assert await client._check_connectivity("https://api.example.com/v1") is None
    assert calls == {"dns": 1, "tcp": 1}


def test_connectivity_check_caches_failure_for_same_base_url(monkeypatch):
    asyncio.run(_test_connectivity_check_caches_failure_for_same_base_url(monkeypatch))


async def _test_connectivity_check_caches_failure_for_same_base_url(monkeypatch):
    calls = {"dns": 0}

    def fake_getaddrinfo(host, port):
        calls["dns"] += 1
        raise socket.gaierror(11001, "not found")

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    client = AIClient()

    first = await client._check_connectivity("https://missing.example.com/v1")
    second = await client._check_connectivity("https://missing.example.com/v1")

    assert first == second
    assert "Error:" in first
    assert calls == {"dns": 1}

def test_error_translation_401():
    asyncio.run(_test_error_translation_401())


async def _test_error_translation_401():
    client = AIClient()
    # Mock _check_connectivity to skip network checks
    with patch.object(client, '_check_connectivity', return_value=None):
        # Mock response
        mock_response = httpx.Response(
            status_code=401,
            content=json.dumps({"error": {"message": "Invalid API Key"}}).encode(),
            headers={"Content-Type": "application/json"}
        )
        
        with patch.object(client.client, 'post', return_value=mock_response):
            result = await client._chat_completion("hello", config={"api_key": "test", "base_url": "http://api.test"})
            assert "API Error 401: API Key无效或未授权" in result
            assert "Invalid API Key" in result

def test_error_translation_429_zhipu_unicode():
    asyncio.run(_test_error_translation_429_zhipu_unicode())


async def _test_error_translation_429_zhipu_unicode():
    client = AIClient()
    # Mock _check_connectivity to skip network checks
    with patch.object(client, '_check_connectivity', return_value=None):
        # Zhipu style 429 with unicode
        zhipu_msg = r'{"error": {"message": "\u60a8\u7684\u8bf7\u6c42\u9891\u7387\u8fc7\u9ad8"}}'
        mock_response = httpx.Response(
            status_code=429,
            content=zhipu_msg.encode(),
            headers={"Content-Type": "application/json"}
        )
        
        with patch.object(client.client, 'post', return_value=mock_response):
            result = await client._chat_completion("hello", config={"api_key": "test", "base_url": "http://api.test"})
            assert "API Error 429: 请求频率过高/达到限额" in result
            assert "您的请求频率过高" in result

def test_error_translation_stream_429():
    asyncio.run(_test_error_translation_stream_429())


async def _test_error_translation_stream_429():
    client = AIClient()
    # Mock _check_connectivity to skip network checks
    with patch.object(client, '_check_connectivity', return_value=None):
        zhipu_msg = r'{"error": {"message": "\u60a8\u7684\u8bf7\u6c42\u9891\u7387\u8fc7\u9ad8"}}'
        mock_response = httpx.Response(
            status_code=429,
            content=zhipu_msg.encode(),
            headers={"Content-Type": "application/json"}
        )
        
        # Mock client.stream context manager
        from unittest.mock import MagicMock
        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_response
        mock_cm.__aexit__.return_value = None
        
        with patch.object(client.client, 'stream', return_value=mock_cm):
            chunks = []
            async for chunk in client.stream_chat([{"role": "user", "content": "hello"}], config={"api_key": "test", "base_url": "http://api.test"}):
                chunks.append(chunk)
            
            full_resp = "".join(chunks)
            assert "data: " in full_resp
            assert "API Error 429: 请求频率过高/达到限额" in full_resp
            assert "您的请求频率过高" in full_resp
