from backend.database import SessionLocal, engine
from sqlalchemy import text
db = SessionLocal()
res = db.execute(text("PRAGMA table_info(note_links)")).fetchall()
print(res)
