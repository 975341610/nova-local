from backend.api import routes
from backend.models.db_models import Base, Note, NoteRevision

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from types import SimpleNamespace


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


def test_snapshot_with_payload_skips_missing_note_without_writing(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("missing notes must not reach revision insertion")

    monkeypatch.setattr(routes, "get_note", lambda db, note_id: None)
    monkeypatch.setattr(routes.revision_service, "maybe_snapshot", fail_if_called)

    result = routes.capture_note_snapshot_api(
        404,
        {"source": "stable", "title": "Gone", "content": "stale queued content"},
        db=object(),
    )

    assert result == {
        "status": "skipped",
        "snapshot_id": None,
        "skipped": True,
        "detail": "Note not found",
    }


def test_snapshot_with_payload_creates_revision_for_file_backed_note_with_foreign_keys(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'revisions.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        monkeypatch.setattr(
            routes,
            "get_note",
            lambda db, note_id: SimpleNamespace(
                id=note_id,
                title="需求",
                content="current",
                summary="",
                tags="",
                icon="",
                type="note",
                notebook_id=None,
                parent_id=None,
                is_folder=False,
                is_title_manually_edited=False,
            ),
        )

        result = routes.capture_note_snapshot_api(
            11,
            {"source": "pre-save", "title": "需求", "content": "queued snapshot"},
            db=db,
        )

        assert result["status"] == "ok"
        assert result["snapshot_id"] is not None
        assert db.get(Note, 11) is not None
        assert db.query(NoteRevision).filter(NoteRevision.note_id == 11).count() == 1
    finally:
        db.close()
        engine.dispose()
