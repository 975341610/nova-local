import sqlite3
conn = sqlite3.connect("data/nova.db")
c = conn.cursor()
c.execute("PRAGMA table_info(note_links);")
print(c.fetchall())
conn.close()
