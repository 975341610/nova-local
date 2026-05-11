from backend.api import routes


def test_should_run_ai_indexing_requires_api_key_base_url_and_enabled_flag(monkeypatch):
    monkeypatch.setattr(routes, "ai_enabled", True)
    assert routes.should_run_ai_indexing({"api_key": "", "base_url": ""}) is False
    assert routes.should_run_ai_indexing({"api_key": "key", "base_url": ""}) is False
    assert routes.should_run_ai_indexing({"api_key": "", "base_url": "http://example.com"}) is False
    assert routes.should_run_ai_indexing({"api_key": "key", "base_url": "http://example.com"}) is True

    monkeypatch.setattr(routes, "ai_enabled", False)
    assert routes.should_run_ai_indexing({"api_key": "key", "base_url": "http://example.com"}) is False
