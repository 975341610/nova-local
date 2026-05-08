from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml


DEFAULT_NOTEBOOK_NAME = "Notes"
TRASH_DIR_NAME = ".trash"
HIDDEN_DIR_NAME = ".nova"
NOTEBOOK_META_NAME = ".notebook.yml"
FOLDER_META_NAME = ".folder.yml"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# v0.22.0-a hotfix10 · 幂等剥离 body 内部嵌套的 YAML frontmatter.
# 历史上的坏数据/版本快照可能已把整份 Markdown (含 frontmatter) 写到 body 里.
# hotfix9 的旧实现只认 "---\n<yaml>\n---\n", 但实际污染可能是:
#   - Windows 换行 (\r\n) 导致 startswith("---\n") 直接 false
#   - YAML parser 把 list 重新序列化时把 frontmatter 压成单行/无空行
#   - 尾部 --- 后没有换行, 后面直接接正文
# 所以这里:
#   1. 先规范化 CRLF -> LF 再扫描
#   2. 用宽松正则匹配开头的 ^---[\r\n]+ ... [\r\n]+---(\r\n|\n|$) 块
#   3. 最多剥 5 次 (防嵌套), 彻底剥完 + 再把开头残留的空行/连字符去掉
def strip_embedded_frontmatter(content: str | None) -> str:
    import re
    if not content:
        return content or ""
    body = content
    # 统一换行, 只在扫描时使用; 最终返回同样是 LF (Electron 端也统一 LF)
    if "\r\n" in body:
        body = body.replace("\r\n", "\n")
    if "\r" in body:
        body = body.replace("\r", "\n")
    pattern = re.compile(r"^---[ \t]*\n.*?\n---[ \t]*(?:\n|$)", re.DOTALL)
    for _ in range(5):
        stripped = body.lstrip()
        if not stripped.startswith("---"):
            break
        m = pattern.match(stripped)
        if not m:
            # 兜底: 只有开头的 "---" 而找不到闭合的情况 -> 不剥离, 跳出
            break
        body = stripped[m.end():]
    return body.lstrip("\n")


def iso_now() -> str:
    return utc_now().isoformat()


def parse_datetime(value: str | datetime | None) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def sanitize_filename(name: str) -> str:
    invalid = '<>:"/\\|?*'
    cleaned = "".join("_" if char in invalid else char for char in name).strip()
    return cleaned or "Untitled"


@dataclass
class VaultLink:
    target_note_id: int
    link_type: str = "manual"


@dataclass
class VaultProperty:
    id: int
    note_id: int
    name: str
    type: str
    value: str


@dataclass
class VaultNotebook:
    id: int
    name: str
    icon: str = "📒"
    created_at: datetime = field(default_factory=utc_now)
    deleted_at: datetime | None = None
    path: Path | None = None
    original_rel_path: str | None = None


@dataclass
class VaultNote:
    id: int
    title: str
    icon: str = "📝"
    content: str = ""
    summary: str = ""
    tags: str = ""
    type: str = "note"
    notebook_id: int | None = None
    parent_id: int | None = None
    is_folder: bool = False
    position: int = 0
    sort_key: str | None = None
    is_title_manually_edited: bool = False
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    deleted_at: datetime | None = None
    path: Path | None = None
    file_path: str | None = None
    background_paper: str | None = None
    uuid: str = field(default_factory=lambda: str(uuid4()))
    stickers: list[dict[str, Any]] = field(default_factory=list)
    sticky_notes: list[dict[str, Any]] = field(default_factory=list)
    properties: list[VaultProperty] = field(default_factory=list)
    links_from: list[VaultLink] = field(default_factory=list)
    links_to: list[VaultLink] = field(default_factory=list)
    children: list["VaultNote"] = field(default_factory=list)
    original_rel_path: str | None = None


class VaultStore:
    def __init__(self, root: Path | str):
        self.root = Path(root)
        self.trash_root = self.root / TRASH_DIR_NAME
        self.hidden_root = self.root / HIDDEN_DIR_NAME
        self.assets_root = self.root / "_assets"
        self.templates_root = self.root / "_templates"
        self.ensure_structure()

    def ensure_structure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.trash_root.mkdir(parents=True, exist_ok=True)
        self.hidden_root.mkdir(parents=True, exist_ok=True)
        self.assets_root.mkdir(parents=True, exist_ok=True)
        self.templates_root.mkdir(parents=True, exist_ok=True)
        self._ensure_default_notebook()

    def _ensure_default_notebook(self) -> VaultNotebook:
        existing = next((item for item in self.list_notebooks() if item.name == DEFAULT_NOTEBOOK_NAME), None)
        if existing:
            return existing
        return self.create_notebook(DEFAULT_NOTEBOOK_NAME, "⚡")

    def _top_level_dirs(self, base: Path) -> list[Path]:
        dirs: list[Path] = []
        for item in sorted(base.iterdir(), key=lambda path: path.name.lower()):
            if not item.is_dir():
                continue
            if item.name.startswith(".") and item.name not in {TRASH_DIR_NAME}:
                continue
            if item.name in {"_assets", "_templates", HIDDEN_DIR_NAME}:
                continue
            dirs.append(item)
        return dirs

    def _load_yaml(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    def _dump_yaml(self, path: Path, data: dict[str, Any]) -> None:
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")

    def _all_meta_ids(self, root: Path, meta_name: str) -> list[int]:
        ids: list[int] = []
        for meta_path in root.rglob(meta_name):
            meta = self._load_yaml(meta_path)
            if "id" in meta:
                ids.append(int(meta["id"]))
        return ids

    def _all_markdown_ids(self, root: Path) -> list[int]:
        ids: list[int] = []
        for note_path in root.rglob("*.md"):
            if note_path.name in {NOTEBOOK_META_NAME, FOLDER_META_NAME}:
                continue
            raw = note_path.read_text(encoding="utf-8")
            if not raw.startswith("---\n"):
                continue
            _, rest = raw.split("---\n", 1)
            meta_text, _, _body = rest.partition("---\n")
            meta = yaml.safe_load(meta_text) or {}
            if "id" in meta:
                ids.append(int(meta["id"]))
        return ids

    def _next_note_id(self) -> int:
        ids = (
            self._all_markdown_ids(self.root)
            + self._all_markdown_ids(self.trash_root)
            + self._all_meta_ids(self.root, FOLDER_META_NAME)
            + self._all_meta_ids(self.trash_root, FOLDER_META_NAME)
        )
        return (max(ids) if ids else 0) + 1

    def _next_notebook_id(self) -> int:
        ids = self._all_meta_ids(self.root, NOTEBOOK_META_NAME) + self._all_meta_ids(self.trash_root, NOTEBOOK_META_NAME)
        return (max(ids) if ids else 0) + 1

    def _notebook_meta_path(self, notebook_dir: Path) -> Path:
        return notebook_dir / NOTEBOOK_META_NAME

    def _folder_meta_path(self, folder_dir: Path) -> Path:
        return folder_dir / FOLDER_META_NAME

    def _read_notebook(self, notebook_dir: Path, deleted: bool = False) -> VaultNotebook:
        meta = self._load_yaml(self._notebook_meta_path(notebook_dir))
        created_at = parse_datetime(meta.get("created_at")) or utc_now()
        deleted_at = parse_datetime(meta.get("deleted_at")) if deleted else None
        return VaultNotebook(
            id=int(meta.get("id", self._next_notebook_id())),
            name=str(meta.get("name", notebook_dir.name)),
            icon=str(meta.get("icon", "📒")),
            created_at=created_at,
            deleted_at=deleted_at,
            path=notebook_dir,
            original_rel_path=meta.get("original_rel_path"),
        )

    def _write_notebook_meta(self, notebook_dir: Path, notebook: VaultNotebook) -> None:
        payload = {
            "id": notebook.id,
            "name": notebook.name,
            "icon": notebook.icon,
            "created_at": notebook.created_at.isoformat(),
            "deleted_at": notebook.deleted_at.isoformat() if notebook.deleted_at else None,
            "original_rel_path": notebook.original_rel_path,
        }
        self._dump_yaml(self._notebook_meta_path(notebook_dir), payload)

    def _folder_to_note(self, folder_dir: Path, notebook: VaultNotebook, parent_id: int | None, deleted: bool = False) -> VaultNote:
        meta = self._load_yaml(self._folder_meta_path(folder_dir))
        note = VaultNote(
            id=int(meta.get("id", self._next_note_id())),
            title=str(meta.get("title", folder_dir.name)),
            icon=str(meta.get("icon", "📁")),
            content="",
            summary="",
            tags=",".join(meta.get("tags", []) or []),
            type=str(meta.get("type", "note")),
            notebook_id=notebook.id,
            parent_id=parent_id,
            is_folder=True,
            position=int(meta.get("position", 0)),
            sort_key=meta.get("sort_key"),
            is_title_manually_edited=bool(meta.get("is_title_manually_edited", False)),
            created_at=parse_datetime(meta.get("created_at")) or utc_now(),
            updated_at=parse_datetime(meta.get("updated_at")) or utc_now(),
            deleted_at=parse_datetime(meta.get("deleted_at")) if deleted else None,
            path=folder_dir,
            file_path=str(folder_dir),
            background_paper=meta.get("background_paper"),
            uuid=str(meta.get("uuid", uuid4())),
            original_rel_path=meta.get("original_rel_path"),
        )
        return note

    def _write_folder_meta(self, folder_dir: Path, note: VaultNote) -> None:
        payload = {
            "id": note.id,
            "uuid": note.uuid,
            "title": note.title,
            "icon": note.icon,
            "type": note.type,
            "tags": [tag for tag in note.tags.split(",") if tag],
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
            "deleted_at": note.deleted_at.isoformat() if note.deleted_at else None,
            "is_title_manually_edited": note.is_title_manually_edited,
            "position": note.position,
            "sort_key": note.sort_key,
            "background_paper": note.background_paper,
            "original_rel_path": note.original_rel_path,
        }
        self._dump_yaml(self._folder_meta_path(folder_dir), payload)

    def _note_frontmatter(self, note: VaultNote) -> dict[str, Any]:
        return {
            "id": note.id,
            "uuid": note.uuid,
            "title": note.title,
            "icon": note.icon,
            "type": note.type,
            "tags": [tag for tag in note.tags.split(",") if tag],
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
            "deleted_at": note.deleted_at.isoformat() if note.deleted_at else None,
            "summary": note.summary,
            "sort_key": note.sort_key,
            "is_title_manually_edited": note.is_title_manually_edited,
            "background_paper": note.background_paper,
            "stickers": note.stickers,
            "sticky_notes": note.sticky_notes,
            "properties": [
                {"id": prop.id, "name": prop.name, "type": prop.type, "value": prop.value}
                for prop in note.properties
            ],
            "links": [link.target_note_id for link in note.links_from if link.link_type == "manual"],
            "ai_links": [link.target_note_id for link in note.links_from if link.link_type == "ai"],
            "original_rel_path": note.original_rel_path,
        }

    def _write_note_file(self, note: VaultNote) -> None:
        if note.path is None:
            raise ValueError("Note path is required")
        # hotfix9: 再落盘前清掉 body 内嵌 frontmatter, 这是最后一道兜底
        clean_body = strip_embedded_frontmatter(note.content or "")
        note.content = clean_body
        frontmatter = yaml.safe_dump(self._note_frontmatter(note), allow_unicode=True, sort_keys=False)
        body = f"---\n{frontmatter}---\n\n{clean_body}"
        note.path.write_text(body, encoding="utf-8")

    def _parse_note_file(self, note_path: Path, notebook: VaultNotebook, parent_id: int | None, deleted: bool = False) -> VaultNote:
        raw = note_path.read_text(encoding="utf-8")
        frontmatter: dict[str, Any] = {}
        body = raw
        if raw.startswith("---\n"):
            _, rest = raw.split("---\n", 1)
            meta_text, _, body = rest.partition("---\n")
            frontmatter = yaml.safe_load(meta_text) or {}
        tags = ",".join(frontmatter.get("tags", []) or [])
        note_id = int(frontmatter.get("id", self._next_note_id()))
        properties = [
            VaultProperty(
                id=int(item.get("id", index + 1)),
                note_id=note_id,
                name=str(item.get("name", "")),
                type=str(item.get("type", "text")),
                value=str(item.get("value", "")),
            )
            for index, item in enumerate(frontmatter.get("properties", []) or [])
        ]
        links = [VaultLink(target_note_id=int(item), link_type="manual") for item in frontmatter.get("links", []) or []]
        links.extend(VaultLink(target_note_id=int(item), link_type="ai") for item in frontmatter.get("ai_links", []) or [])
        note = VaultNote(
            id=note_id,
            title=str(frontmatter.get("title", note_path.stem)),
            icon=str(frontmatter.get("icon", "📝")),
            # hotfix9: 防御性剥掉 body 内部的嵌套 frontmatter
            content=strip_embedded_frontmatter(body.lstrip("\n")),
            summary=str(frontmatter.get("summary", "")),
            tags=tags,
            type=str(frontmatter.get("type", "note")),
            notebook_id=notebook.id,
            parent_id=parent_id,
            is_folder=False,
            position=0,
            sort_key=frontmatter.get("sort_key"),
            is_title_manually_edited=bool(frontmatter.get("is_title_manually_edited", False)),
            created_at=parse_datetime(frontmatter.get("created_at")) or utc_now(),
            updated_at=parse_datetime(frontmatter.get("updated_at")) or utc_now(),
            deleted_at=parse_datetime(frontmatter.get("deleted_at")) if deleted else None,
            path=note_path,
            file_path=str(note_path),
            background_paper=frontmatter.get("background_paper"),
            uuid=str(frontmatter.get("uuid", uuid4())),
            stickers=frontmatter.get("stickers", []) or [],
            sticky_notes=frontmatter.get("sticky_notes", []) or [],
            properties=properties,
            links_from=links,
            original_rel_path=frontmatter.get("original_rel_path"),
        )
        return note

    def _iter_folder_notes(self, notebook: VaultNotebook, folder_dir: Path, parent_id: int | None, deleted: bool = False) -> list[VaultNote]:
        notes: list[VaultNote] = []
        for item in sorted(folder_dir.iterdir(), key=lambda path: path.name.lower()):
            if item.name in {NOTEBOOK_META_NAME, FOLDER_META_NAME}:
                continue
            if item.is_dir():
                folder_note = self._folder_to_note(item, notebook, parent_id, deleted=deleted)
                notes.append(folder_note)
                notes.extend(self._iter_folder_notes(notebook, item, folder_note.id, deleted=deleted))
            elif item.suffix.lower() == ".md":
                notes.append(self._parse_note_file(item, notebook, parent_id, deleted=deleted))
        return notes

    def list_notebooks(self) -> list[VaultNotebook]:
        notebooks: list[VaultNotebook] = []
        for notebook_dir in self._top_level_dirs(self.root):
            if notebook_dir == self.trash_root:
                continue
            meta_path = self._notebook_meta_path(notebook_dir)
            if not meta_path.exists():
                notebook = VaultNotebook(id=self._next_notebook_id(), name=notebook_dir.name, path=notebook_dir)
                self._write_notebook_meta(notebook_dir, notebook)
            notebooks.append(self._read_notebook(notebook_dir))
        return notebooks

    def list_trashed_notebooks(self) -> list[VaultNotebook]:
        notebooks: list[VaultNotebook] = []
        for notebook_dir in sorted(self.trash_root.iterdir(), key=lambda path: path.name.lower()):
            if not notebook_dir.is_dir():
                continue
            meta_path = self._notebook_meta_path(notebook_dir)
            if meta_path.exists():
                notebooks.append(self._read_notebook(notebook_dir, deleted=True))
        return notebooks

    def get_notebook_by_id(self, notebook_id: int) -> VaultNotebook | None:
        for notebook in self.list_notebooks():
            if notebook.id == notebook_id:
                return notebook
        return None

    def create_notebook(self, name: str, icon: str = "📒") -> VaultNotebook:
        notebook_dir = self.root / sanitize_filename(name)
        notebook_dir.mkdir(parents=True, exist_ok=True)
        notebook = VaultNotebook(id=self._next_notebook_id(), name=name.strip(), icon=icon, path=notebook_dir)
        self._write_notebook_meta(notebook_dir, notebook)
        return notebook

    def update_notebook(self, notebook_id: int, name: str | None = None, icon: str | None = None) -> VaultNotebook | None:
        notebook = self.get_notebook_by_id(notebook_id)
        if notebook is None or notebook.path is None:
            return None
        target_dir = notebook.path
        if name is not None and name.strip() and name.strip() != notebook.name:
            target_dir = notebook.path.with_name(sanitize_filename(name.strip()))
            notebook.path.rename(target_dir)
            notebook.name = name.strip()
            notebook.path = target_dir
        if icon is not None:
            notebook.icon = icon
        self._write_notebook_meta(target_dir, notebook)
        return notebook

    def soft_delete_notebook(self, notebook_id: int) -> VaultNotebook | None:
        notebook = self.get_notebook_by_id(notebook_id)
        if notebook is None or notebook.path is None:
            return None
        target = self.trash_root / f"{sanitize_filename(notebook.name)}__notebook_{notebook.id}"
        notebook.deleted_at = utc_now()
        notebook.original_rel_path = notebook.path.name
        notebook.path.rename(target)
        notebook.path = target
        self._write_notebook_meta(target, notebook)
        return notebook

    def restore_notebook(self, notebook_id: int) -> VaultNotebook | None:
        for notebook in self.list_trashed_notebooks():
            if notebook.id != notebook_id or notebook.path is None:
                continue
            destination = self.root / sanitize_filename(notebook.original_rel_path or notebook.name)
            notebook.path.rename(destination)
            notebook.path = destination
            notebook.deleted_at = None
            notebook.original_rel_path = None
            self._write_notebook_meta(destination, notebook)
            return notebook
        return None

    def purge_notebook(self, notebook_id: int) -> bool:
        notebook = next((item for item in self.list_trashed_notebooks() if item.id == notebook_id), None)
        if notebook is None or notebook.path is None:
            return False
        for child in sorted(notebook.path.rglob("*"), reverse=True):
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                child.rmdir()
        notebook.path.rmdir()
        return True

    def list_notes(self, include_content: bool = True) -> list[VaultNote]:
        notes: list[VaultNote] = []
        for notebook in self.list_notebooks():
            if notebook.path is None:
                continue
            notes.extend(self._iter_folder_notes(notebook, notebook.path, None, deleted=False))
        for index, note in enumerate(notes):
            note.position = index
            if not include_content:
                note.content = None  # type: ignore[assignment]
        return notes

    def list_trashed_notes(self) -> list[VaultNote]:
        notes: list[VaultNote] = []
        for notebook in self.list_trashed_notebooks():
            if notebook.path is None:
                continue
            notes.extend(self._iter_folder_notes(notebook, notebook.path, None, deleted=True))
        for item in sorted(self.trash_root.iterdir(), key=lambda path: path.name.lower()):
            if not item.is_dir():
                continue
            if self._notebook_meta_path(item).exists():
                continue
            folder_meta = self._folder_meta_path(item)
            if not folder_meta.exists():
                continue
            notebook = VaultNotebook(id=0, name="Trash", path=self.trash_root)
            folder_note = self._folder_to_note(item, notebook, None, deleted=True)
            notes.append(folder_note)
            notes.extend(self._iter_folder_notes(notebook, item, folder_note.id, deleted=True))
        for item in sorted(self.trash_root.glob("*.md"), key=lambda path: path.name.lower()):
            notebook = VaultNotebook(id=0, name="Trash", path=self.trash_root)
            notes.append(self._parse_note_file(item, notebook, None, deleted=True))
        return notes

    def get_note(self, note_id: int) -> VaultNote | None:
        for note in self.list_notes(include_content=True):
            if note.id == note_id:
                return note
        for note in self.list_trashed_notes():
            if note.id == note_id:
                return note
        return None

    def _resolve_parent_dir(self, notebook_name: str | None, parent_id: int | None) -> tuple[Path, int | None]:
        notebook = self._ensure_default_notebook() if notebook_name is None else next(
            (item for item in self.list_notebooks() if item.name == notebook_name),
            self.create_notebook(notebook_name),
        )
        if parent_id is None:
            return notebook.path or (self.root / DEFAULT_NOTEBOOK_NAME), notebook.id
        parent = self.get_note(parent_id)
        if parent is None or parent.path is None or not parent.is_folder:
            raise ValueError(f"Parent folder {parent_id} not found")
        return parent.path, notebook.id

    def _unique_path(self, desired: Path) -> Path:
        if not desired.exists():
            return desired
        counter = 2
        while True:
            candidate = desired.with_name(f"{desired.stem} {counter}{desired.suffix}")
            if not candidate.exists():
                return candidate
            counter += 1

    def create_note(
        self,
        title: str,
        content: str,
        tags: list[str] | None,
        notebook_name: str | None,
        parent_id: int | None,
        icon: str = "📝",
        note_type: str = "note",
        is_folder: bool = False,
        is_title_manually_edited: bool = False,
        properties: list[dict[str, Any]] | None = None,
        background_paper: str | None = None,
        sort_key: str | None = None,
        stickers: list[dict[str, Any]] | None = None,
        sticky_notes: list[dict[str, Any]] | None = None,
    ) -> VaultNote:
        parent_dir, notebook_id = self._resolve_parent_dir(notebook_name, parent_id)
        note_id = self._next_note_id()
        note = VaultNote(
            id=note_id,
            title=title.strip() or "Untitled",
            icon=icon,
            content=content,
            summary="",
            tags=",".join(tags or []),
            type=note_type,
            notebook_id=notebook_id,
            parent_id=parent_id,
            is_folder=is_folder,
            sort_key=sort_key,
            is_title_manually_edited=is_title_manually_edited,
            created_at=utc_now(),
            updated_at=utc_now(),
            file_path=None,
            background_paper=background_paper,
            stickers=list(stickers or []),
            sticky_notes=list(sticky_notes or []),
        )
        if properties:
            note.properties = [
                VaultProperty(id=index + 1, note_id=note_id, name=item["name"], type=item["type"], value=item["value"])
                for index, item in enumerate(properties)
            ]
        base_name = sanitize_filename(note.title)
        if is_folder:
            folder_dir = self._unique_path(parent_dir / base_name)
            folder_dir.mkdir(parents=True, exist_ok=False)
            note.path = folder_dir
            note.file_path = str(folder_dir)
            self._write_folder_meta(folder_dir, note)
        else:
            note_path = self._unique_path(parent_dir / f"{base_name}.md")
            note.path = note_path
            note.file_path = str(note_path)
            self._write_note_file(note)
        return note

    def update_note(
        self,
        note_id: int,
        title: str | None = None,
        content: str | None = None,
        summary: str | None = None,
        tags: list[str] | None = None,
        icon: str | None = None,
        note_type: str | None = None,
        parent_id: int | None = None,
        is_title_manually_edited: bool | None = None,
        is_folder: bool | None = None,
        properties: list[dict[str, Any]] | None = None,
        background_paper: str | None = None,
        sort_key: str | None = None,
        stickers: list[dict[str, Any]] | None = None,
        sticky_notes: list[dict[str, Any]] | None = None,
    ) -> VaultNote | None:
        note = self.get_note(note_id)
        if note is None or note.path is None:
            return None
        if title is not None and title != note.title:
            target_name = sanitize_filename(title)
            target = note.path.with_name(target_name if note.is_folder else f"{target_name}.md")
            target = self._unique_path(target) if target != note.path else target
            note.path.rename(target)
            note.path = target
            note.file_path = str(target)
            note.title = title
        if content is not None:
            # hotfix9: 防御性剥离嵌套 frontmatter, 防止历史坏数据/恢复链路污染
            note.content = strip_embedded_frontmatter(content)
        if summary is not None:
            note.summary = summary
        if tags is not None:
            note.tags = ",".join(tags)
        if icon is not None:
            note.icon = icon
        if note_type is not None:
            note.type = note_type
        if parent_id is not None and parent_id != note.parent_id:
            note = self.move_note(note.id, note.notebook_id, note.position, parent_id) or note
        if is_title_manually_edited is not None:
            note.is_title_manually_edited = is_title_manually_edited
        if is_folder is not None:
            note.is_folder = is_folder
        if properties is not None:
            note.properties = [
                VaultProperty(id=index + 1, note_id=note.id, name=item["name"], type=item["type"], value=item["value"])
                for index, item in enumerate(properties)
            ]
        if background_paper is not None:
            note.background_paper = background_paper
        if sort_key is not None:
            note.sort_key = sort_key
        if stickers is not None:
            note.stickers = list(stickers)
        if sticky_notes is not None:
            note.sticky_notes = list(sticky_notes)
        note.updated_at = utc_now()
        if note.is_folder:
            self._write_folder_meta(note.path, note)
        else:
            self._write_note_file(note)
        return note

    def move_note(self, note_id: int, notebook_id: int | None, position: int, parent_id: int | None = None) -> VaultNote | None:
        note = self.get_note(note_id)
        if note is None or note.path is None:
            return None
        # v0.22.0-a hotfix11 · 硬防护: 禁止把节点移动到自身或自身的子孙
        if parent_id is not None:
            if int(parent_id) == int(note.id):
                raise ValueError("Cannot move a note into itself")
            parent = self.get_note(parent_id)
            if parent is None or parent.path is None or not parent.is_folder:
                return None
            try:
                parent.path.resolve().relative_to(note.path.resolve())
                raise ValueError("Cannot move a folder into itself or its descendant")
            except ValueError as exc:
                if "Cannot move" in str(exc):
                    raise
                # parent.path is NOT relative to note.path -> 合法
            destination_dir = parent.path
            note.parent_id = parent_id
            note.notebook_id = parent.notebook_id
        elif notebook_id is not None:
            notebook = self.get_notebook_by_id(notebook_id)
            if notebook is None or notebook.path is None:
                return None
            destination_dir = notebook.path
            note.parent_id = None
            note.notebook_id = notebook.id
        else:
            notebook = self._ensure_default_notebook()
            destination_dir = notebook.path or (self.root / DEFAULT_NOTEBOOK_NAME)
            note.parent_id = None
            note.notebook_id = notebook.id
        target = self._unique_path(destination_dir / note.path.name)
        note.path.rename(target)
        note.path = target
        note.file_path = str(target)
        note.position = position
        note.updated_at = utc_now()
        if note.is_folder:
            self._write_folder_meta(target, note)
        else:
            self._write_note_file(note)
        return note

    def bulk_move_notes(self, note_ids: list[int], notebook_id: int | None, position: int, parent_id: int | None = None) -> list[VaultNote]:
        moved: list[VaultNote] = []
        current_position = position
        for note_id in note_ids:
            note = self.move_note(note_id, notebook_id, current_position, parent_id)
            if note is not None:
                moved.append(note)
                current_position += 1
        return moved

    def soft_delete_note(self, note_id: int) -> VaultNote | None:
        note = self.get_note(note_id)
        if note is None or note.path is None or note.deleted_at is not None:
            return None
        relative = note.path.relative_to(self.root)
        note.deleted_at = utc_now()
        note.original_rel_path = str(relative)
        destination = self.trash_root / f"{sanitize_filename(note.title)}__{note.id}{note.path.suffix}"
        if note.is_folder:
            destination = self.trash_root / f"{sanitize_filename(note.title)}__folder_{note.id}"
        destination = self._unique_path(destination)
        note.path.rename(destination)
        note.path = destination
        note.file_path = str(destination)
        note.updated_at = utc_now()
        if note.is_folder:
            self._write_folder_meta(destination, note)
        else:
            self._write_note_file(note)
        return note

    def bulk_soft_delete_notes(self, note_ids: list[int]) -> list[VaultNote]:
        deleted: list[VaultNote] = []
        for note_id in note_ids:
            note = self.soft_delete_note(note_id)
            if note is not None:
                deleted.append(note)
        return deleted

    def restore_note(self, note_id: int) -> VaultNote | None:
        note = next((item for item in self.list_trashed_notes() if item.id == note_id), None)
        if note is None or note.path is None:
            return None
        original = Path(note.original_rel_path or f"{DEFAULT_NOTEBOOK_NAME}/{sanitize_filename(note.title)}{note.path.suffix}")
        destination = self.root / original
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination = self._unique_path(destination)
        note.path.rename(destination)
        note.path = destination
        note.file_path = str(destination)
        note.deleted_at = None
        note.original_rel_path = None
        note.updated_at = utc_now()
        if note.is_folder:
            self._write_folder_meta(destination, note)
        else:
            self._write_note_file(note)
        return note

    def purge_note(self, note_id: int) -> bool:
        note = next((item for item in self.list_trashed_notes() if item.id == note_id), None)
        if note is None or note.path is None:
            return False
        if note.is_folder:
            for child in sorted(note.path.rglob("*"), reverse=True):
                if child.is_file():
                    child.unlink()
                elif child.is_dir():
                    child.rmdir()
            note.path.rmdir()
        else:
            note.path.unlink(missing_ok=True)
        return True
