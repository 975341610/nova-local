from __future__ import annotations

import json
from pathlib import Path
from typing import Any

AI_MODE_REMOTE = "remote"
AI_MODE_LOCAL = "local"
VALID_AI_MODES = {AI_MODE_REMOTE, AI_MODE_LOCAL}


def normalize_ai_mode(value: str | None) -> str:
    return value if value in VALID_AI_MODES else AI_MODE_REMOTE


def read_ai_runtime_config(data_root: Path) -> dict[str, Any]:
    config_path = Path(data_root) / "ai_config.json"
    config: dict[str, Any] = {"enabled": True, "ai_mode": AI_MODE_REMOTE, "num_ctx": 8192}
    if not config_path.exists():
        return config

    try:
        loaded = json.loads(config_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            config.update(loaded)
    except Exception:
        return config

    config["enabled"] = bool(config.get("enabled", True))
    config["ai_mode"] = normalize_ai_mode(config.get("ai_mode"))
    return config


def should_run_remote_ai_indexing(enabled: bool, ai_mode: str, llm_config: dict[str, str] | None) -> bool:
    if not enabled or normalize_ai_mode(ai_mode) != AI_MODE_REMOTE or not llm_config:
        return False
    return bool(llm_config.get("api_key") and llm_config.get("base_url"))
