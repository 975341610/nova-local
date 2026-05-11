from pathlib import Path

from backend.database import ensure_sqlite_database_file


def test_ensure_sqlite_database_file_moves_corrupt_database_aside(tmp_path: Path):
    db_path = tmp_path / "second_brain.db"
    wal_path = tmp_path / "second_brain.db-wal"
    shm_path = tmp_path / "second_brain.db-shm"
    db_path.write_text("mock database", encoding="utf-8")
    wal_path.write_text("wal", encoding="utf-8")
    shm_path.write_text("shm", encoding="utf-8")

    result = ensure_sqlite_database_file(db_path)

    assert result is not None
    assert result.name.startswith("second_brain.db.corrupt-")
    assert result.exists()
    assert not db_path.exists()
    assert not wal_path.exists()
    assert not shm_path.exists()
