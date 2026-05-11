from backend.api import routes


def test_get_revision_returns_missing_payload_when_note_temporarily_absent(monkeypatch):
    monkeypatch.setattr(routes.revision_service, "get_revision", lambda db, note_id, revision_id: None)
    monkeypatch.setattr(routes, "get_note", lambda db, note_id: None)

    result = routes.get_note_revision_api(42, 99, db=object())

    assert result == {
        "id": 99,
        "note_id": 42,
        "created_at": None,
        "content_hash": "",
        "title_snapshot": "",
        "byte_size": 0,
        "source": "missing",
        "content": "",
        "missing": True,
    }
