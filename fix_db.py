import sqlite3
conn = sqlite3.connect("data/second_brain.db")
try:
    conn.execute("ALTER TABLE note_links ADD COLUMN link_type VARCHAR DEFAULT 'ai'")
    print("Column link_type added to note_links.")
except sqlite3.OperationalError as e:
    print(e)
conn.commit()
conn.close()
