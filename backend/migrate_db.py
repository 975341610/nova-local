"""SQLite migration helper.

Adds `type` column to `notes` table (default: 'note').

Usage:
  cd nova_repo && python -m backend.migrate_db
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def get_target_db_paths() -> list[Path]:
    """Best-effort: pick the DB the app actually uses, plus legacy candidates."""
    paths: list[Path] = []

    try:
        from backend.config import get_settings

        settings = get_settings()
        # settings.sqlite_url: sqlite:////abs/path/to/second_brain.db
        sqlite_path = settings.sqlite_url.replace("sqlite:///", "")
        paths.append(Path(sqlite_path))
    except Exception:
        # If config import fails, fall back to common defaults.
        pass

    # Legacy / candidate paths (relative to repo root)
    paths.extend([
        ROOT_DIR / "data" / "second_brain.db",
        ROOT_DIR / "data" / "nova.db",
    ])

    # De-dup, keep order
    seen: set[str] = set()
    uniq: list[Path] = []
    for p in paths:
        key = str(p.resolve()) if p.exists() else str(p)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)
    return uniq


def migrate_one(db_path: Path) -> None:
    if not db_path.exists():
        print(f"[skip] DB not found: {db_path}")
        return

    print(f"[run] Migrating DB: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Ensure notes table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='notes' LIMIT 1"
        )
        if cursor.fetchone() is None:
            print("[skip] table 'notes' not found")
            return

        cursor.execute("PRAGMA table_info(notes)")
        columns = [col[1] for col in cursor.fetchall()]

        if "type" not in columns:
            cursor.execute("ALTER TABLE notes ADD COLUMN type VARCHAR(50) DEFAULT 'note'")
            print("[ok] added column notes.type")
        else:
            print("[ok] column notes.type already exists")

        # Backfill (safe even if newly added)
        cursor.execute("UPDATE notes SET type='note' WHERE type IS NULL OR type='' ")
        conn.commit()
        print(f"[ok] backfilled rows: {cursor.rowcount}")

    finally:
        conn.close()


def main() -> None:
    for p in get_target_db_paths():
        migrate_one(p)


if __name__ == "__main__":
    main()
