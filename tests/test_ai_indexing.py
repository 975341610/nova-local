from backend.api import routes


def test_should_run_ai_indexing_requires_api_key_and_base_url():
    assert routes.should_run_ai_indexing({"api_key": "", "base_url": ""}) is False
    assert routes.should_run_ai_indexing({"api_key": "key", "base_url": ""}) is False
    assert routes.should_run_ai_indexing({"api_key": "", "base_url": "http://example.com"}) is False
    assert routes.should_run_ai_indexing({"api_key": "key", "base_url": "http://example.com"}) is True
