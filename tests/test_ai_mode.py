from pathlib import Path
from backend.services.ai_mode import read_ai_runtime_config, should_run_remote_ai_indexing


def test_ai_mode_defaults_to_remote_when_missing(tmp_path):
    config = read_ai_runtime_config(tmp_path)

    assert config["ai_mode"] == "remote"


def test_ai_mode_loads_valid_local_mode(tmp_path):
    (tmp_path / "ai_config.json").write_text('{"enabled": true, "ai_mode": "local"}', encoding="utf-8")

    config = read_ai_runtime_config(tmp_path)

    assert config["ai_mode"] == "local"


def test_ai_mode_rejects_invalid_mode(tmp_path):
    (tmp_path / "ai_config.json").write_text('{"enabled": true, "ai_mode": "bad"}', encoding="utf-8")

    config = read_ai_runtime_config(tmp_path)

    assert config["ai_mode"] == "remote"


def test_should_run_ai_indexing_only_in_remote_mode():
    assert should_run_remote_ai_indexing(True, "remote", {"api_key": "key", "base_url": "http://example.com"}) is True
    assert should_run_remote_ai_indexing(True, "local", {"api_key": "key", "base_url": "http://example.com"}) is False
    assert should_run_remote_ai_indexing(False, "remote", {"api_key": "key", "base_url": "http://example.com"}) is False


def test_inline_ai_generator_has_no_local_json_import():
    routes = Path(__file__).resolve().parents[1] / "backend" / "api" / "routes.py"
    text = routes.read_text(encoding="utf-8")
    inline_start = text.index("async def inline_ai")
    generator_start = text.index("    async def generate():", inline_start)
    generator_end = text.index("    return StreamingResponse(", generator_start)

    assert "import json" not in text[generator_start:generator_end]
