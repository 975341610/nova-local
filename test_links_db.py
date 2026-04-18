import requests

r1 = requests.post('http://127.0.0.1:8765/api/notes', json={"title": "A", "content": "Content"})
id_A = r1.json()['id']
print("A created", id_A)

r2 = requests.post('http://127.0.0.1:8765/api/notes', json={"title": "B", "content": f'link to <span data-type="note-link" data-id="{id_A}">A</span>'})
id_B = r2.json()['id']
print("B created", id_B)

r_back = requests.get(f'http://127.0.0.1:8765/api/notes/{id_A}/backlinks')
print("A backlinks:", r_back.status_code, r_back.text)

r_links = requests.get(f'http://127.0.0.1:8765/api/notes/{id_B}/links')
print("B links:", r_links.status_code, r_links.text)

