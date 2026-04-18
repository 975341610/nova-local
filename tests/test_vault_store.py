from __future__ import annotations

from pathlib import Path

import pytest


def test_create_note_writes_markdown_file(tmp_path: Path):
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)

    note = store.create_note(
        title="Hello World",
        content="# Body",
        tags=["alpha", "beta"],
        notebook_name=None,
        parent_id=None,
        icon="📝",
        note_type="note",
        is_folder=False,
        is_title_manually_edited=False,
    )

    note_path = tmp_path / "Notes" / "Hello World.md"
    assert note_path.exists()
    assert note.title == "Hello World"
    assert note.tags == "alpha,beta"
    assert note.content == "# Body"


def test_delete_and_restore_note_round_trip(tmp_path: Path):
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)
    note = store.create_note(
        title="Trash Me",
        content="body",
        tags=[],
        notebook_name=None,
        parent_id=None,
        icon="📝",
        note_type="note",
        is_folder=False,
        is_title_manually_edited=False,
    )

    store.soft_delete_note(note.id)

    assert not (tmp_path / "Notes" / "Trash Me.md").exists()
    trashed = store.list_trashed_notes()
    assert [item.title for item in trashed] == ["Trash Me"]

    restored = store.restore_note(note.id)

    assert restored is not None
    assert (tmp_path / "Notes" / "Trash Me.md").exists()
    assert store.list_trashed_notes() == []


def test_delete_and_purge_folder_round_trip(tmp_path: Path):
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)
    folder = store.create_note(
        title="Folder Trash",
        content="",
        tags=[],
        notebook_name=None,
        parent_id=None,
        icon="📁",
        note_type="note",
        is_folder=True,
        is_title_manually_edited=False,
    )

    store.soft_delete_note(folder.id)

    trashed = store.list_trashed_notes()
    assert [item.title for item in trashed] == ["Folder Trash"]
    assert store.purge_note(folder.id) is True


def test_move_note_changes_real_file_location(tmp_path: Path):
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)
    notebook = store.create_notebook("Projects", "📁")
    note = store.create_note(
        title="Move Me",
        content="body",
        tags=[],
        notebook_name=None,
        parent_id=None,
        icon="📝",
        note_type="note",
        is_folder=False,
        is_title_manually_edited=False,
    )

    moved = store.move_note(note.id, notebook_id=notebook.id, position=0, parent_id=None)

    assert moved is not None
    assert not (tmp_path / "Notes" / "Move Me.md").exists()
    assert (tmp_path / "Projects" / "Move Me.md").exists()


def test_repositories_source_notes_from_vault(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from backend.services import repositories
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)
    monkeypatch.setattr(repositories, "get_vault_store", lambda: store)

    created = repositories.create_note(
        db=None,
        title="Repo Note",
        content="repo body",
        summary="",
        tags=["repo"],
        notebook_id=None,
    )
    loaded = repositories.get_note(db=None, note_id=created.id)
    listed = repositories.list_notes(db=None)

    assert loaded is not None
    assert loaded.title == "Repo Note"
    assert [item.title for item in listed] == ["Repo Note"]


def test_background_paper_round_trip_in_vault(tmp_path: Path):
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)
    created = store.create_note(
        title="Grid Note",
        content="body",
        tags=[],
        notebook_name=None,
        parent_id=None,
        icon="馃摑",
        note_type="note",
        is_folder=False,
        is_title_manually_edited=False,
        background_paper="grid",
    )

    store.update_note(created.id, background_paper="dot")
    loaded = store.get_note(created.id)

    assert loaded is not None
    assert loaded.background_paper == "dot"
    assert "background_paper: dot" in created.path.read_text(encoding="utf-8")


def test_repositories_persist_background_paper(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from backend.services import repositories
    from backend.services.vault_store import VaultStore

    store = VaultStore(tmp_path)
    monkeypatch.setattr(repositories, "get_vault_store", lambda: store)

    created = repositories.create_note(
        db=None,
        title="Paper Note",
        content="body",
        summary="",
        tags=["paper"],
        notebook_id=None,
        background_paper="line",
    )
    updated = repositories.update_note(
        db=None,
        note_id=created.id,
        background_paper="grid",
    )

    assert updated is not None
    assert updated.background_paper == "grid"
    assert repositories.get_note(db=None, note_id=created.id).background_paper == "grid"


def test_settings_expose_vault_and_asset_paths(tmp_path: Path):
    from backend.config import Settings

    settings = Settings(data_root=tmp_path)

    assert settings.vault_path == (tmp_path / "vault").as_posix()
    assert settings.uploads_path == (tmp_path / "vault" / "_assets").as_posix()
