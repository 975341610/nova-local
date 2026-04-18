from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes import note_to_response
from backend.database import Base
from backend.services.repositories import create_note, update_note


def test_note_type_persists_and_is_exposed(tmp_path):
    db_path = tmp_path / "note_type_test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as db:
        note = create_note(
            db,
            title="typed note",
            content="content",
            summary="",
            tags=["tag1"],
            notebook_id=None,
            icon="📝",
            type="task",
        )
        assert note.type == "task"

        updated = update_note(db, note.id, type="memo")
        assert updated is not None
        assert updated.type == "memo"

        payload = note_to_response(updated)
        assert payload.type == "memo"
