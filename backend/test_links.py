import requests

try:
    r = requests.get('http://127.0.0.1:8765/api/notes/8/backlinks')
    print(r.status_code, r.json())
except Exception as e:
    print(e)
