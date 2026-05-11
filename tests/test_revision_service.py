import gzip
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models.db_models import NoteRevision
from backend.services import revision_service


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _content(row: NoteRevision) -> str:
    return gzip.decompress(row.content_gz).decode("utf-8")


def test_auto_snapshot_debounces_without_overwriting_existing_revision(monkeypatch):
    db = _session()
    start = datetime(2026, 5, 10, 1, 0, 0)
    moments = iter([
        start,
        start + timedelta(seconds=2),
        start + timedelta(seconds=12),
    ])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 10, "max_keep": 50})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    first = revision_service.maybe_snapshot(db, 1, "Note", "<p>A</p>", source="auto")
    assert first is not None

    debounced = revision_service.maybe_snapshot(db, 1, "Note", "<p>B</p>", source="auto")
    assert debounced is None

    rows = db.query(NoteRevision).filter(NoteRevision.note_id == 1).order_by(NoteRevision.created_at).all()
    assert len(rows) == 1
    assert _content(rows[0]) == "<p>A</p>"
    assert rows[0].created_at == start

    after_debounce = revision_service.maybe_snapshot(db, 1, "Note", "<p>C</p>", source="auto")
    assert after_debounce is not None

    rows = db.query(NoteRevision).filter(NoteRevision.note_id == 1).order_by(NoteRevision.created_at).all()
    assert len(rows) == 2
    assert [_content(row) for row in rows] == ["<p>A</p>", "<p>C</p>"]


def test_auto_snapshot_skips_duplicate_content(monkeypatch):
    db = _session()
    start = datetime(2026, 5, 10, 1, 0, 0)
    moments = iter([start, start + timedelta(seconds=20)])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 10, "max_keep": 50})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    first = revision_service.maybe_snapshot(db, 1, "Note", "<p>A</p>", source="auto")
    assert first is not None

    duplicate = revision_service.maybe_snapshot(db, 1, "Note", "<p>A</p>", source="auto")
    assert duplicate is None

    rows = db.query(NoteRevision).filter(NoteRevision.note_id == 1).all()
    assert len(rows) == 1
    assert _content(rows[0]) == "<p>A</p>"


def test_pre_save_snapshot_is_not_debounced(monkeypatch):
    db = _session()
    start = datetime(2026, 5, 10, 1, 0, 0)
    moments = iter([
        start,
        start + timedelta(seconds=2),
    ])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 10, "max_keep": 50})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    first = revision_service.maybe_snapshot(db, 1, "Note", "<p>A</p>", source="auto")
    assert first is not None

    pre_save = revision_service.maybe_snapshot(db, 1, "Note", "<p>B</p>", source="pre-save")
    assert pre_save is not None

    rows = db.query(NoteRevision).filter(NoteRevision.note_id == 1).order_by(NoteRevision.created_at).all()
    assert len(rows) == 2
    assert [_content(row) for row in rows] == ["<p>A</p>", "<p>B</p>"]
    assert rows[1].source == "pre-save"


def test_pre_save_snapshot_debounces_against_recent_pre_save(monkeypatch):
    db = _session()
    start = datetime(2026, 5, 10, 1, 0, 0)
    moments = iter([
        start,
        start + timedelta(seconds=2),
    ])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 10, "max_keep": 50})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    first = revision_service.maybe_snapshot(db, 1, "Note", "<p>A</p>", source="pre-save")
    assert first is not None

    debounced = revision_service.maybe_snapshot(db, 1, "Note", "<p>B</p>", source="pre-save")
    assert debounced is None

    rows = db.query(NoteRevision).filter(NoteRevision.note_id == 1).order_by(NoteRevision.created_at).all()
    assert len(rows) == 1
    assert _content(rows[0]) == "<p>A</p>"


def test_stable_snapshot_after_pre_save_is_visible_and_deduplicated(monkeypatch):
    db = _session()
    start = datetime(2026, 5, 10, 1, 0, 0)
    moments = iter([
        start,
        start + timedelta(seconds=2),
        start + timedelta(seconds=4),
        start + timedelta(seconds=6),
    ])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 10, "max_keep": 50})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    original = revision_service.maybe_snapshot(db, 1, "Note", "<p>original</p>", source="auto")
    in_progress = revision_service.maybe_snapshot(db, 1, "Note", "<p>typing...</p>", source="pre-save")
    final = revision_service.maybe_snapshot(db, 1, "Note", "<p>finished</p>", source="stable")
    duplicate = revision_service.maybe_snapshot(db, 1, "Note", "<p>finished</p>", source="stable")

    assert original is not None
    assert in_progress is not None
    assert final is not None
    assert duplicate is None

    visible_rows = revision_service.list_revisions(db, 1)
    assert [row.source for row in visible_rows] == ["stable", "auto"]
    assert [_content(row) for row in visible_rows] == ["<p>finished</p>", "<p>original</p>"]


def test_list_revisions_keeps_latest_internal_when_only_internal_rows_exist(monkeypatch):
    db = _session()
    start = datetime(2026, 5, 10, 1, 0, 0)
    moments = iter([
        start,
        start + timedelta(seconds=20),
    ])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 10, "max_keep": 50})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    first = revision_service.maybe_snapshot(db, 1, "Note", "<p>typing 1</p>", source="pre-save")
    second = revision_service.maybe_snapshot(db, 1, "Note", "<p>typing 2</p>", source="pre-save")

    assert first is not None
    assert second is not None

    visible_rows = revision_service.list_revisions(db, 1)
    assert len(visible_rows) == 1
    assert visible_rows[0].id == second.id
    assert _content(visible_rows[0]) == "<p>typing 2</p>"


def test_restore_keeps_target_and_restore_point_when_pruning(monkeypatch):
    db = _session()
    moments = iter([
        datetime(2026, 5, 10, 1, 0, 0),
        datetime(2026, 5, 10, 1, 0, 10),
        datetime(2026, 5, 10, 1, 0, 20),
        datetime(2026, 5, 10, 1, 0, 30),
    ])
    monkeypatch.setattr(revision_service, "_load_settings", lambda: {"debounce_seconds": 1, "max_keep": 2})
    monkeypatch.setattr(revision_service, "_now", lambda: next(moments))

    first = revision_service.maybe_snapshot(db, 1, "Note", "<p>first</p>", source="auto")
    target = revision_service.maybe_snapshot(db, 1, "Note", "<p>target</p>", source="save")
    latest = revision_service.maybe_snapshot(db, 1, "Note", "<p>latest</p>", source="save")
    assert first is not None
    assert target is not None
    assert latest is not None

    restored = revision_service.restore_revision(
        db,
        note_id=1,
        revision_id=target.id,
        current_title="Note",
        current_content="<p>current before restore</p>",
    )
    assert restored is not None
    restored_content, _ = restored
    assert restored_content == "<p>target</p>"

    rows = db.query(NoteRevision).filter(NoteRevision.note_id == 1).order_by(NoteRevision.created_at).all()
    ids = {row.id for row in rows}
    sources = {row.source for row in rows}
    assert first.id in ids
    assert target.id in ids
    assert "restore-point" in sources
