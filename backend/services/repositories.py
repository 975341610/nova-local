from __future__ import annotations

from datetime import datetime
from functools import lru_cache

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.db_models import (
    Achievement,
    ModelConfig,
    NoteProperty,
    NoteTemplate,
    Task,
    UserAchievement,
    UserStats,
    deobfuscate,
    obfuscate,
)
from backend.models.schemas import NotePropertyBase
from backend.services.vault_store import DEFAULT_NOTEBOOK_NAME, VaultLink, VaultNotebook, VaultNote, VaultStore


INBOX_NOTEBOOK_NAME = "Inbox"


@lru_cache(maxsize=1)
def get_vault_store() -> VaultStore:
    return VaultStore(get_settings().vault_path)


def list_notebooks(db: Session | None = None) -> list[VaultNotebook]:
    return get_vault_store().list_notebooks()


def list_trashed_notebooks(db: Session | None = None) -> list[VaultNotebook]:
    return get_vault_store().list_trashed_notebooks()


def get_or_create_default_notebook(db: Session | None = None) -> VaultNotebook:
    store = get_vault_store()
    notebook = next((item for item in store.list_notebooks() if item.name == DEFAULT_NOTEBOOK_NAME), None)
    return notebook or store.create_notebook(DEFAULT_NOTEBOOK_NAME, "⚡")


def create_notebook(db: Session | None, name: str, icon: str = "📒") -> VaultNotebook:
    return get_vault_store().create_notebook(name.strip(), icon)


def update_notebook(db: Session | None, notebook_id: int, name: str | None = None, icon: str | None = None) -> VaultNotebook | None:
    return get_vault_store().update_notebook(notebook_id, name=name, icon=icon)


def _notebook_name_from_id(notebook_id: int | None) -> str | None:
    if notebook_id is None:
        return None
    notebook = get_vault_store().get_notebook_by_id(notebook_id)
    return notebook.name if notebook else None


def next_note_position(db: Session | None, notebook_id: int | None, parent_id: int | None = None) -> int:
    siblings = [
        note
        for note in get_vault_store().list_notes(include_content=False)
        if note.notebook_id == notebook_id and note.parent_id == parent_id and note.deleted_at is None
    ]
    return len(siblings) + 1


def list_notes(
    db: Session | None = None,
    property_filter: dict[str, str] | None = None,
    *,
    include_content: bool = True,
) -> list[VaultNote]:
    notes = get_vault_store().list_notes(include_content=include_content)
    if not property_filter:
        return notes
    filtered: list[VaultNote] = []
    for note in notes:
        props = {prop.name: prop.value for prop in note.properties}
        if all(props.get(name) == value for name, value in property_filter.items()):
            filtered.append(note)
    return filtered


def list_trashed_notes(db: Session | None = None) -> list[VaultNote]:
    return get_vault_store().list_trashed_notes()


def get_note(db: Session | None, note_id: int) -> VaultNote | None:
    return get_vault_store().get_note(note_id)


def create_note(
    db: Session | None,
    title: str,
    content: str,
    summary: str,
    tags: list[str] | None,
    notebook_id: int | None,
    icon: str = "📝",
    type: str = "note",
    parent_id: int | None = None,
    is_title_manually_edited: bool = False,
    is_folder: bool = False,
    background_paper: str | None = None,
    sort_key: str | None = None,
    stickers: list[dict] | None = None,
    sticky_notes: list[dict] | None = None,
) -> VaultNote:
    store = get_vault_store()
    note = store.create_note(
        title=title,
        content=content,
        tags=tags,
        notebook_name=_notebook_name_from_id(notebook_id),
        parent_id=parent_id,
        icon=icon,
        note_type=type,
        is_folder=is_folder,
        is_title_manually_edited=is_title_manually_edited,
        background_paper=background_paper,
        sort_key=sort_key,
        stickers=stickers,
        sticky_notes=sticky_notes,
    )
    note.summary = summary
    if summary and not note.is_folder:
        store.update_note(note.id, summary=summary)
        refreshed = store.get_note(note.id)
        if refreshed is not None:
            note = refreshed
    return note


def update_note(
    db: Session | None,
    note_id: int,
    title: str | None = None,
    content: str | None = None,
    summary: str | None = None,
    tags: list[str] | None = None,
    icon: str | None = None,
    type: str | None = None,
    parent_id: int | None = None,
    is_title_manually_edited: bool | None = None,
    is_folder: bool | None = None,
    properties: list[NotePropertyBase] | None = None,
    background_paper: str | None = None,
    sort_key: str | None = None,
    stickers: list[dict] | None = None,
    sticky_notes: list[dict] | None = None,
) -> VaultNote | None:
    payload_properties = None
    if properties is not None:
        payload_properties = [
            {"name": prop.get("name") if isinstance(prop, dict) else prop.name,
             "type": prop.get("type") if isinstance(prop, dict) else prop.type,
             "value": prop.get("value") if isinstance(prop, dict) else prop.value}
            for prop in properties
        ]
    return get_vault_store().update_note(
        note_id=note_id,
        title=title,
        content=content,
        summary=summary,
        tags=tags,
        icon=icon,
        note_type=type,
        parent_id=parent_id,
        is_title_manually_edited=is_title_manually_edited,
        is_folder=is_folder,
        properties=payload_properties,
        background_paper=background_paper,
        sort_key=sort_key,
        stickers=stickers,
        sticky_notes=sticky_notes,
    )


def list_notes_tree(db: Session | None = None, *, include_content: bool = False) -> list[VaultNote]:
    notes = list_notes(db, include_content=include_content)
    note_map = {note.id: note for note in notes}
    roots: list[VaultNote] = []
    for note in notes:
        note.children = []
    for note in notes:
        if note.parent_id and note.parent_id in note_map:
            note_map[note.parent_id].children.append(note)
        else:
            roots.append(note)
    return roots


def move_note(db: Session | None, note_id: int, notebook_id: int | None, position: int, parent_id: int | None = None) -> VaultNote | None:
    return get_vault_store().move_note(note_id, notebook_id, position, parent_id)


def bulk_move_notes(db: Session | None, note_ids: list[int], notebook_id: int | None, position: int, parent_id: int | None = None) -> list[VaultNote]:
    return get_vault_store().bulk_move_notes(note_ids, notebook_id, position, parent_id)


def soft_delete_note(db: Session | None, note_id: int) -> VaultNote | None:
    return get_vault_store().soft_delete_note(note_id)


def bulk_soft_delete_notes(db: Session | None, note_ids: list[int]) -> list[VaultNote]:
    return get_vault_store().bulk_soft_delete_notes(note_ids)


def restore_note(db: Session | None, note_id: int) -> VaultNote | None:
    return get_vault_store().restore_note(note_id)


def purge_note(db: Session | None, note_id: int) -> bool:
    return get_vault_store().purge_note(note_id)


def purge_trash(db: Session | None = None) -> bool:
    store = get_vault_store()
    ok = True
    for note in list(store.list_trashed_notes()):
        ok = store.purge_note(note.id) and ok
    for notebook in list(store.list_trashed_notebooks()):
        ok = store.purge_notebook(notebook.id) and ok
    return ok


def soft_delete_notebook(db: Session | None, notebook_id: int) -> VaultNotebook | None:
    notebook = get_vault_store().get_notebook_by_id(notebook_id)
    if notebook and notebook.name == DEFAULT_NOTEBOOK_NAME:
        return None
    return get_vault_store().soft_delete_notebook(notebook_id)


def restore_notebook(db: Session | None, notebook_id: int) -> VaultNotebook | None:
    return get_vault_store().restore_notebook(notebook_id)


def purge_notebook(db: Session | None, notebook_id: int) -> bool:
    notebook = next((item for item in get_vault_store().list_trashed_notebooks() if item.id == notebook_id), None)
    if notebook and notebook.name == DEFAULT_NOTEBOOK_NAME:
        return False
    return get_vault_store().purge_notebook(notebook_id)


def replace_note_links(db: Session | None, source_note_id: int, targets: list[tuple[int, float]], link_type: str = "manual") -> None:
    note = get_vault_store().get_note(source_note_id)
    if note is None:
        return
    note.links_from = [
        link for link in note.links_from
        if link.link_type != link_type
    ]
    note.links_from.extend(
        [VaultLink(target_note_id=target_id, link_type=link_type) for target_id, _score in targets if target_id != source_note_id]
    )
    get_vault_store().update_note(note.id)


def list_tasks(db: Session) -> list[Task]:
    priority_rank = case(
        (Task.priority == "high", 0),
        (Task.priority == "medium", 1),
        else_=2,
    )
    return list(
        db.scalars(
            select(Task).order_by(
                Task.status.asc(),
                Task.deadline.is_(None),
                Task.deadline.asc(),
                priority_rank,
                Task.created_at.desc(),
            )
        )
    )


def create_task(
    db: Session,
    title: str,
    status: str = "todo",
    priority: str = "medium",
    task_type: str = "work",
    deadline: datetime | None = None,
) -> Task:
    task = Task(title=title, status=status, priority=priority, task_type=task_type, deadline=deadline)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def find_task_by_title(db: Session, title: str) -> Task | None:
    normalized = title.strip().lower()
    if not normalized:
        return None
    statement = select(Task).where(func.lower(Task.title) == normalized).order_by(Task.created_at.desc())
    return db.scalar(statement)


def update_task(
    db: Session,
    task_id: int,
    title: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    task_type: str | None = None,
    deadline: datetime | None = None,
) -> Task | None:
    task = db.get(Task, task_id)
    if not task:
        return None
    if title is not None:
        task.title = title
    if status is not None:
        task.status = status
    if priority is not None:
        task.priority = priority
    if task_type is not None:
        task.task_type = task_type
    task.deadline = deadline
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task_id: int) -> bool:
    task = db.get(Task, task_id)
    if not task:
        return False
    db.delete(task)
    db.commit()
    return True


def clear_completed_tasks(db: Session) -> int:
    statement = select(Task).where(Task.status == "done")
    tasks = list(db.scalars(statement))
    count = len(tasks)
    for task in tasks:
        db.delete(task)
    db.commit()
    return count


def create_note_property(db: Session, note_id: int, name: str, type: str, value: str) -> NoteProperty:
    prop = NoteProperty(note_id=note_id, name=name, type=type, value=value)
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def update_note_property(db: Session, property_id: int, name: str | None = None, type: str | None = None, value: str | None = None) -> NoteProperty | None:
    prop = db.get(NoteProperty, property_id)
    if not prop:
        return None
    if name is not None:
        prop.name = name
    if type is not None:
        prop.type = type
    if value is not None:
        prop.value = value
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def delete_note_property(db: Session, property_id: int) -> bool:
    prop = db.get(NoteProperty, property_id)
    if not prop:
        return False
    db.delete(prop)
    db.commit()
    return True


def get_note_properties(db: Session, note_id: int) -> list[NoteProperty]:
    return list(db.scalars(select(NoteProperty).where(NoteProperty.note_id == note_id)))


def get_or_create_model_config(db: Session) -> ModelConfig:
    config = db.get(ModelConfig, 1)
    if not config:
        config = ModelConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return ModelConfig(
        id=config.id,
        provider=config.provider,
        api_key=deobfuscate(config.api_key),
        base_url=config.base_url,
        model_name=config.model_name,
        updated_at=config.updated_at,
    )


def update_model_config(db: Session, provider: str, api_key: str, base_url: str, model_name: str) -> ModelConfig:
    config = db.get(ModelConfig, 1) or ModelConfig(id=1)
    config.provider = provider
    config.api_key = obfuscate(api_key)
    config.base_url = base_url
    config.model_name = model_name
    db.add(config)
    db.commit()
    db.refresh(config)
    return get_or_create_model_config(db)


def get_or_create_inbox_notebook(db: Session | None = None) -> VaultNotebook:
    notebook = next((item for item in get_vault_store().list_notebooks() if item.name == INBOX_NOTEBOOK_NAME), None)
    return notebook or get_vault_store().create_notebook(INBOX_NOTEBOOK_NAME, "📥")


def get_or_create_user_stats(db: Session) -> UserStats:
    stats = db.get(UserStats, 1)
    if not stats:
        stats = UserStats(id=1, exp=0, level=1, total_captures=0, current_theme="default")
        db.add(stats)
        db.commit()
        db.refresh(stats)
    return stats


def update_user_theme(db: Session, theme: str) -> UserStats:
    stats = get_or_create_user_stats(db)
    stats.current_theme = theme
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


def list_achievements(db: Session) -> list[Achievement]:
    return list(db.scalars(select(Achievement)))


def list_user_achievements(db: Session) -> list[UserAchievement]:
    return list(db.scalars(select(UserAchievement).order_by(UserAchievement.unlocked_at.desc())))


def check_and_unlock_achievements(db: Session) -> list[UserAchievement]:
    stats = get_or_create_user_stats(db)
    all_achievements = list_achievements(db)
    unlocked_ids = {ua.achievement_id for ua in list_user_achievements(db)}

    newly_unlocked = []
    for ach in all_achievements:
        if ach.id in unlocked_ids:
            continue
        unlocked = False
        if ach.condition_type == "total_captures" and stats.total_captures >= ach.condition_value:
            unlocked = True
        elif ach.condition_type == "level" and stats.level >= ach.condition_value:
            unlocked = True
        if unlocked:
            ua = UserAchievement(achievement_id=ach.id)
            db.add(ua)
            newly_unlocked.append(ua)

    if newly_unlocked:
        db.commit()
        for ua in newly_unlocked:
            db.refresh(ua)

    return newly_unlocked


def init_default_achievements(db: Session) -> None:
    defaults = [
        {"name": "First Capture", "description": "Capture 1 idea", "condition_type": "total_captures", "condition_value": 1, "icon": "🌱"},
        {"name": "Capture Expert", "description": "Capture 10 ideas", "condition_type": "total_captures", "condition_value": 10, "icon": "🕸️"},
        {"name": "Archivist", "description": "Reach level 2", "condition_type": "level", "condition_value": 2, "icon": "🥉"},
        {"name": "Knowledge Keeper", "description": "Reach level 5", "condition_type": "level", "condition_value": 5, "icon": "🥈"},
    ]
    for item in defaults:
        exists = db.scalar(select(Achievement).where(Achievement.name == item["name"]))
        if not exists:
            db.add(Achievement(**item))
    db.commit()


def add_exp(db: Session, amount: int) -> UserStats:
    stats = get_or_create_user_stats(db)
    stats.exp += amount
    stats.total_captures += 1
    import math
    stats.level = max(stats.level, math.floor(math.sqrt(stats.exp / 100)) + 1)
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


def update_user_wallpaper(db: Session, wallpaper_url: str) -> UserStats:
    stats = get_or_create_user_stats(db)
    stats.wallpaper_url = wallpaper_url
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


def list_templates(db: Session) -> list[NoteTemplate]:
    return list(db.scalars(select(NoteTemplate).order_by(NoteTemplate.category.asc(), NoteTemplate.name.asc())))


def get_template(db: Session, template_id: int) -> NoteTemplate | None:
    return db.get(NoteTemplate, template_id)


def create_template(db: Session, name: str, content: str, icon: str = "📄", category: str = "general") -> NoteTemplate:
    template = NoteTemplate(name=name, content=content, icon=icon, category=category)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_template(
    db: Session,
    template_id: int,
    name: str | None = None,
    content: str | None = None,
    icon: str | None = None,
    category: str | None = None,
) -> NoteTemplate | None:
    template = db.get(NoteTemplate, template_id)
    if not template:
        return None
    if name is not None:
        template.name = name
    if content is not None:
        template.content = content
    if icon is not None:
        template.icon = icon
    if category is not None:
        template.category = category
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template_id: int) -> bool:
    template = db.get(NoteTemplate, template_id)
    if not template:
        return False
    db.delete(template)
    db.commit()
    return True
