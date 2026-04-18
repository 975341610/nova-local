# Local Vault Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move note, folder, trash, and attachment storage to a local vault on disk while keeping the current repository and IPC surface usable.

**Architecture:** Introduce a dedicated vault storage module that owns file-system CRUD and frontmatter parsing, then route note/notebook repository operations through it. Keep SQLite for non-note data and compatibility, but stop treating note rows as the source of truth.

**Tech Stack:** Python 3.11, pathlib, FastAPI-compatible repository layer, SQLAlchemy for non-note data, pytest for regression tests

---

### Task 1: Add vault regression tests

**Files:**
- Create: `tests/test_vault_store.py`
- Test: `tests/test_vault_store.py`

- [ ] **Step 1: Write the failing tests**

```python
from pathlib import Path

from backend.services.vault_store import VaultStore


def test_create_note_writes_markdown_file(tmp_path: Path):
    store = VaultStore(tmp_path)
    note = store.create_note(title="Hello", content="# Body", parent_path=None)
    assert (tmp_path / "Notes" / "Hello.md").exists()
    assert note["title"] == "Hello"


def test_delete_note_moves_file_into_trash(tmp_path: Path):
    store = VaultStore(tmp_path)
    note = store.create_note(title="Trash Me", content="body", parent_path=None)
    store.delete_note(note["id"])
    assert (tmp_path / ".trash").exists()
    assert not (tmp_path / "Notes" / "Trash Me.md").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services.vault_store'`

- [ ] **Step 3: Write minimal implementation**

```python
class VaultStore:
    def __init__(self, root):
        ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/test_vault_store.py backend/services/vault_store.py
git commit -m "feat: add local vault storage"
```

### Task 2: Route repositories through the vault store

**Files:**
- Create: `backend/services/vault_store.py`
- Modify: `backend/services/repositories.py`
- Test: `tests/test_vault_store.py`

- [ ] **Step 1: Write the failing repository integration tests**

```python
def test_repository_create_note_uses_vault(tmp_path, monkeypatch):
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: FAIL because repositories still rely on SQLite note rows only

- [ ] **Step 3: Write minimal implementation**

```python
def create_note(...):
    return get_vault_store().create_note(...)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/repositories.py backend/services/vault_store.py tests/test_vault_store.py
git commit -m "refactor: source notes from local vault"
```

### Task 3: Update config and serialization glue

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/ipc_bridge.py`
- Modify: `backend/models/schemas.py`
- Test: `tests/test_vault_store.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_vault_paths_default_under_data_root(tmp_path, monkeypatch):
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: FAIL because config does not expose a vault path

- [ ] **Step 3: Write minimal implementation**

```python
@property
def vault_path(self) -> str:
    return (self.data_root / "vault").as_posix()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/ipc_bridge.py backend/models/schemas.py tests/test_vault_store.py
git commit -m "feat: expose vault metadata through config and ipc"
```

### Task 4: Verification

**Files:**
- Test: `tests/test_vault_store.py`

- [ ] **Step 1: Run targeted regression tests**

Run: `python -m pytest tests/test_vault_store.py -q`
Expected: PASS

- [ ] **Step 2: Run syntax verification**

Run: `python -m compileall backend`
Expected: exit code 0

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test: verify local vault migration"
```
