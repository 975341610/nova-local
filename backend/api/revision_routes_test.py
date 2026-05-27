from backend.api import routes
from backend.models.db_models import Base, Note, NoteRevision

from datetime import datetime
import gzip
import hashlib
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


def test_snapshot_with_payload_uses_payload_when_vault_note_is_temporarily_missing(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'payload-without-vault-note.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        monkeypatch.setattr(routes, "get_note", lambda db, note_id: None)
        file_card_content = '<div data-type="file-card" src="/api/media/static/files/missing.pdf" name="missing.pdf"></div>'

        result = routes.capture_note_snapshot_api(
            15,
            {"source": "stable", "title": "With file", "content": file_card_content},
            db=db,
        )

        assert result["status"] == "ok"
        assert result["snapshot_id"] is not None
        shadow = db.get(Note, 15)
        assert shadow is not None
        assert shadow.deleted_at is None
        restored = routes.revision_service.get_revision(db, 15, result["snapshot_id"])
        assert restored is not None
        assert restored[0] == file_card_content
    finally:
        db.close()
        engine.dispose()


def test_snapshot_with_payload_does_not_scan_vault_when_db_shadow_exists(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'payload-fast-path.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        db.add(Note(id=18, title="Existing", content="old", summary="", tags="", type="note"))
        db.commit()

        def fail_if_vault_scanned(*args, **kwargs):
            raise AssertionError("payload snapshots must not scan the vault")

        monkeypatch.setattr(routes, "get_note", fail_if_vault_scanned)
        file_card_content = '<div data-type="file-card" src="/api/media/static/files/demo.pdf" name="demo.pdf"></div>'

        result = routes.capture_note_snapshot_api(
            18,
            {"source": "stable", "title": "Existing", "content": file_card_content},
            db=db,
        )

        assert result["status"] == "ok"
        assert result["snapshot_id"] is not None
        restored = routes.revision_service.get_revision(db, 18, result["snapshot_id"])
        assert restored is not None
        assert restored[0] == file_card_content
    finally:
        db.close()
        engine.dispose()


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

        file_card_content = '<div data-type="file-card" src="/api/media/static/files/demo.pdf" name="demo.pdf"></div>'
        result = routes.capture_note_snapshot_api(
            11,
            {"source": "pre-save", "title": "需求", "content": file_card_content},
            db=db,
        )

        assert result["status"] == "ok"
        assert result["snapshot_id"] is not None
        assert db.get(Note, 11) is not None
        assert db.query(NoteRevision).filter(NoteRevision.note_id == 11).count() == 1
        restored = routes.revision_service.get_revision(db, 11, result["snapshot_id"])
        assert restored is not None
        assert restored[0] == file_card_content
    finally:
        db.close()
        engine.dispose()


def test_snapshot_with_payload_recovers_when_shadow_note_was_not_created(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'revisions-retry.db'}")

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
        monkeypatch.setattr(routes, "_ensure_revision_note_row", lambda db, note: None)

        result = routes.capture_note_snapshot_api(
            12,
            {
                "source": "stable",
                "title": "需求",
                "content": '<div data-type="file-card" src="/api/media/static/files/demo.pdf" name="demo.pdf"></div>',
            },
            db=db,
        )

        assert result["status"] == "ok"
        assert result["snapshot_id"] is not None
        assert db.get(Note, 12) is not None
        assert db.query(NoteRevision).filter(NoteRevision.note_id == 12).count() == 1
    finally:
        db.close()
        engine.dispose()


def test_ensure_revision_note_row_revives_deleted_shadow_note(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'shadow-revive.db'}")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        db.add(
            Note(
                id=22,
                title="old",
                content="old",
                summary="",
                tags="",
                type="note",
                deleted_at=datetime(2026, 5, 1, 1, 2, 3),
            )
        )
        db.commit()

        routes._ensure_revision_note_row(
            db,
            SimpleNamespace(
                id=22,
                title="restored",
                content='<div data-type="file-card" src="/api/media/static/files/demo.pdf"></div>',
                summary="summary",
                tags="file",
                icon="📄",
                type="note",
                is_folder=False,
                is_title_manually_edited=True,
            ),
        )

        shadow = db.get(Note, 22)
        assert shadow is not None
        assert shadow.deleted_at is None
        assert shadow.title == "restored"
        assert "file-card" in shadow.content
    finally:
        db.close()
        engine.dispose()


def test_force_revision_note_row_repairs_existing_deleted_shadow_note(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'shadow-force-repair.db'}")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        db.add(
            Note(
                id=33,
                title="old",
                content="old",
                summary="",
                tags="",
                type="note",
                deleted_at=datetime(2026, 5, 1, 1, 2, 3),
            )
        )
        db.commit()

        routes._force_revision_note_row(
            db,
            33,
            SimpleNamespace(
                id=33,
                title="fresh",
                content="fresh content",
                summary="fresh summary",
                tags="fresh-tag",
                icon="",
                type="note",
                is_folder=False,
                is_title_manually_edited=False,
            ),
            title="fallback title",
            content="fallback content",
        )

        shadow = db.get(Note, 33)
        assert shadow is not None
        assert shadow.deleted_at is None
        assert shadow.title == "fresh"
        assert shadow.content == "fresh content"
    finally:
        db.close()
        engine.dispose()


def test_revision_list_serializes_naive_datetimes_as_utc(monkeypatch):
    monkeypatch.setattr(
        routes.revision_service,
        "list_revisions",
        lambda db, note_id: [
            SimpleNamespace(
                id=1,
                note_id=note_id,
                created_at=datetime(2026, 5, 25, 3, 9, 21, 593504),
                content_hash="abc",
                title_snapshot="需求：",
                byte_size=12,
                source="stable",
            )
        ],
    )

    result = routes.list_note_revisions_api(11, db=object())

    assert result[0]["created_at"] == "2026-05-25T03:09:21.593504+00:00"


def test_restore_revision_with_file_card_keeps_attachment_html_and_revision_list(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'restore-file-card.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        deleted_file_content = "<p>file removed</p>"
        file_card_content = (
            '<p>before</p>'
            '<div data-type="file-card" class="notion-file-block" '
            'src="/api/media/static/files/demo.pdf" name="demo.pdf" '
            'size="69427" type="application/pdf"></div>'
        )
        db.add(
            Note(
                id=44,
                title="With file",
                content=deleted_file_content,
                summary="",
                tags="",
                type="note",
            )
        )
        db.commit()
        content_bytes = file_card_content.encode("utf-8")
        revision = NoteRevision(
            note_id=44,
            created_at=datetime(2026, 5, 26, 1, 2, 3),
            content_gz=gzip.compress(content_bytes),
            content_hash=hashlib.sha1(content_bytes).hexdigest(),
            title_snapshot="With file",
            byte_size=len(content_bytes),
            source="stable",
        )
        db.add(revision)
        db.commit()
        db.refresh(revision)

        result = routes.restore_note_revision_api(44, revision.id, db=db)

        assert result.content == file_card_content
        assert "file-card" in db.get(Note, 44).content
        revisions = routes.list_note_revisions_api(44, db=db)
        assert revisions
        assert all(row["note_id"] == 44 for row in revisions)
    finally:
        db.close()
        engine.dispose()


def test_restore_revision_with_db_note_does_not_scan_vault(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'restore-db-note-fast-path.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        target_content = (
            '<p>restored</p>'
            '<div data-type="file-card" src="/api/media/static/files/demo.pdf" '
            'name="demo.pdf" type="application/pdf"></div>'
        )
        db.add(Note(id=55, title="With file", content="<p>deleted file</p>", summary="", tags="", type="note"))
        db.commit()
        content_bytes = target_content.encode("utf-8")
        revision = NoteRevision(
            note_id=55,
            created_at=datetime(2026, 5, 26, 1, 2, 3),
            content_gz=gzip.compress(content_bytes),
            content_hash=hashlib.sha1(content_bytes).hexdigest(),
            title_snapshot="With file",
            byte_size=len(content_bytes),
            source="stable",
        )
        db.add(revision)
        db.commit()
        db.refresh(revision)

        def fail_if_vault_scanned(*args, **kwargs):
            raise AssertionError("restore must use the db note fast path before scanning the vault")

        monkeypatch.setattr(routes, "get_note", fail_if_vault_scanned)
        monkeypatch.setattr(routes, "update_note", lambda *args, **kwargs: None)

        result = routes.restore_note_revision_api(55, revision.id, db=db)

        assert result.content == target_content
        assert db.get(Note, 55).content == target_content
    finally:
        db.close()
        engine.dispose()
