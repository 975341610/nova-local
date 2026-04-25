from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.main import app


client = TestClient(app)


@pytest.fixture()
def isolated_vault(tmp_path: Path):
    settings = get_settings()
    original_data_root = settings.data_root
    settings.data_root = tmp_path / "data"
    vault = Path(settings.vault_path)
    vault.mkdir(parents=True)
    yield vault
    settings.data_root = original_data_root


def test_vault_health_endpoint_returns_report(isolated_vault: Path):
    (isolated_vault / "note.md").write_text("![x](_assets/missing.png)", encoding="utf-8")
    (isolated_vault / "_assets").mkdir()

    response = client.get("/api/system/vault-health")

    assert response.status_code == 200
    assert response.json()["summary"]["missing_attachments"] == 1
