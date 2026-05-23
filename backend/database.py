from collections.abc import Generator
from datetime import datetime
from pathlib import Path
import sqlite3
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import get_settings

settings = get_settings()

class Base(DeclarativeBase):
    pass


def ensure_sqlite_database_file(db_path: str | Path) -> Path | None:
    """Move a corrupt SQLite file aside before SQLAlchemy opens it."""
    path = Path(db_path)
    if not path.exists() or path.stat().st_size == 0:
        return None

    with path.open("rb") as file:
        header = file.read(16)

    if header == b"SQLite format 3\x00":
        try:
            with sqlite3.connect(path) as conn:
                result = conn.execute("PRAGMA integrity_check").fetchone()
                if result and result[0] == "ok":
                    return None
        except sqlite3.DatabaseError:
            pass

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = path.with_name(f"{path.name}.corrupt-{timestamp}")
    path.replace(backup_path)
    for suffix in ("-wal", "-shm"):
        sidecar = path.with_name(f"{path.name}{suffix}")
        if sidecar.exists():
            sidecar.unlink()
    print(f"[!] Corrupt SQLite database moved to {backup_path}; a fresh database will be created.")
    return backup_path

# 增加 timeout 到 30秒 (默认5秒)，给并发操作更多等待时间
engine = create_engine(
    settings.sqlite_url, 
    connect_args={"check_same_thread": False, "timeout": 30}
)

# 开启 WAL 模式 (Write-Ahead Logging) 以大幅提升并发性能
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def with_db_retry(max_retries=3, delay=1.0):
    """Decorator to retry DB operations on OperationalError (e.g. database is locked)"""
    import functools
    import time
    import random
    from sqlalchemy.exc import OperationalError

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    if "locked" in str(e).lower():
                        last_exc = e
                        # Exponential backoff with jitter
                        wait_time = delay * (2 ** attempt) + random.uniform(0, 1)
                        time.sleep(wait_time)
                        continue
                    raise e
            raise last_exc
        return wrapper
    return decorator
