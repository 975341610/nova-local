from __future__ import annotations
# 🚀 核心修复：在导入任何其他模块前先加载 llama_cpp，防止 Windows 上的 DLL 冲突导致的 Access Violation
try:
    import llama_cpp
except ImportError:
    pass

import os
import sys
import uuid
import shutil
import asyncio
import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from PIL import Image
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.agent.planner import run_agent
from backend.config import get_settings
from backend.models.db_models import Note, Notebook
from backend.models.schemas import (
    AgentRequest,
    AskRequest,
    AskResponse,
    BulkNoteAction,
    Citation,
    GeneratedNotePersistResponse,
    GeneratedNoteResponse,
    ImportPreviewItem,
    ImportPreviewResponse,
    ImportBatchAskRequest,
    ImportUrlRequest,
    InlineAIRequest,
    ModelConfigPayload,
    NotebookCreate,
    NotebookUpdate,
    NotebookResponse,
    NoteCreate,
    NoteMovePayload,
    NotePropertyCreate,
    NotePropertyResponse,
    NotePropertyUpdate,
    NoteResponse,
    NoteTemplateCreate,
    NoteTemplateResponse,
    NoteTemplateUpdate,
    NoteListItemResponse,
    NoteTreeResponse,
    NormalizedContentPayload,
    NoteUpdate,
    QuickCaptureRequest,
    QuickCaptureResponse,
    SearchRequest,
    TagSuggestRequest,
    TagSuggestResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    TrashResponse,
    UploadResponse,
    UserStatsResponse,
    AchievementResponse,
    UserAchievementResponse,
    ThemeUpdatePayload,
)
from backend.database import get_db, SessionLocal, engine
from backend.utils import log_buffer
import subprocess
import json
from backend.config import get_settings, get_custom_config_path, PROJECT_DIR
from backend.rag.pipeline import citations_from_results, cosine_similarity, search_knowledge
from backend.services.ai_client import AIClient
from backend.services.ai_mode import AI_MODE_LOCAL, AI_MODE_REMOTE, normalize_ai_mode, read_ai_runtime_config, should_run_remote_ai_indexing
from backend.services.document_service import build_import_preview_item, build_url_preview_item, chunk_text, combine_imported_documents_for_note_generation, combine_imported_urls_for_note_generation, fetch_url_article, parse_document
from backend.services.import_generation import generate_note_from_imported_documents
from backend.services.note_generation import generate_structured_note
from backend.services.note_indexing_queue import NoteIndexingQueue
from backend.services.template_files import delete_template_file, mirror_template_to_vault
from backend.services.vault_health import scan_vault_health
from backend.services import revision_service
from backend.services.repositories import (
    add_exp,
    create_note,
    create_notebook,
    create_note_property,
    create_task,
    delete_note_property,
    delete_task,
    clear_completed_tasks,
    get_note,
    get_note_properties,
    get_or_create_default_notebook,
    get_or_create_inbox_notebook,
    get_or_create_model_config,
    get_or_create_user_stats,
    list_notes,
    list_notes_tree,
    list_notebooks,
    list_templates,
    list_trashed_notes,
    list_trashed_notebooks,
    list_tasks,
    bulk_move_notes,
    bulk_soft_delete_notes,
    create_template,
    delete_template,
    move_note,
    purge_note,
    purge_notebook,
    replace_note_links,
    restore_note,
    restore_notebook,
    soft_delete_note,
    soft_delete_notebook,
    purge_trash,
    update_notebook,
    update_note,
    update_template,
    mask_api_key,
    update_model_config,
    update_note_property,
    update_task,
    list_user_achievements,
    check_and_unlock_achievements,
    update_user_theme,
    update_user_wallpaper,
)
from backend.api.path_security import safe_child_path, safe_media_subdir, safe_named_file, validate_uuid
from backend.services.vector_store import vector_store

from backend.services.local_ai import local_ai_manager

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


def _delete_vector_chunks_for_notes(note_ids: list[int] | set[int]) -> None:
    """Best-effort cleanup so deleted notes stop appearing in RAG results."""
    for note_id in sorted({int(note_id) for note_id in note_ids if note_id is not None}):
        try:
            vector_store.delete_note_chunks(note_id)
        except Exception as exc:
            logger.warning("Failed to delete vector chunks for note %s: %s", note_id, exc)


def _ensure_revision_note_row(db: Session, note) -> None:
    """Create the DB shadow row that note_revisions references for file-backed notes."""
    note_id = getattr(note, "id", None)
    if not isinstance(note_id, int):
        return
    if db.get(Note, note_id) is not None:
        return
    db.add(
        Note(
            id=note_id,
            title=(getattr(note, "title", "") or "Untitled")[:255],
            icon=getattr(note, "icon", "") or "",
            content=getattr(note, "content", "") or "",
            summary=getattr(note, "summary", "") or "",
            tags=getattr(note, "tags", "") or "",
            type=getattr(note, "type", "") or "note",
            notebook_id=None,
            parent_id=None,
            is_folder=bool(getattr(note, "is_folder", False)),
            is_title_manually_edited=bool(getattr(note, "is_title_manually_edited", False)),
        )
    )
    db.flush()


def _revision_timestamp_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


UPLOAD_READ_CHUNK_BYTES = 1024 * 1024


def _raise_upload_too_large(filename: str | None = None) -> None:
    label = f" '{filename}'" if filename else ""
    raise HTTPException(
        status_code=413,
        detail=f"Uploaded file{label} exceeds the {settings.max_upload_bytes} byte limit",
    )


def _enforce_upload_size(content: bytes, *, filename: str | None = None) -> bytes:
    if len(content) > settings.max_upload_bytes:
        _raise_upload_too_large(filename)
    return content


async def read_upload_file_limited(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_upload_bytes:
            _raise_upload_too_large(file.filename)
        chunks.append(chunk)
    return b"".join(chunks)


def read_upload_file_sync_limited(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = file.file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_upload_bytes:
            _raise_upload_too_large(file.filename)
        chunks.append(chunk)
    return b"".join(chunks)
ai_client = AIClient()
note_indexing_queue: NoteIndexingQueue | None = None

import platform
import psutil

# AI 插件状态全局变量
ai_enabled = True
ai_mode = AI_MODE_REMOTE
UPLOAD_SESSION_TTL_SECONDS = 30 * 60


def cleanup_expired_upload_sessions(now: float | None = None, ttl_seconds: int = UPLOAD_SESSION_TTL_SECONDS) -> None:
    now = now if now is not None else time.time()
    temp_root = Path(settings.uploads_path) / "temp"
    if not temp_root.exists():
        return
    for session_dir in temp_root.iterdir():
        if not session_dir.is_dir():
            continue
        try:
            newest_mtime = max(
                (path.stat().st_mtime for path in session_dir.rglob("*")),
                default=session_dir.stat().st_mtime,
            )
            if now - newest_mtime > ttl_seconds:
                shutil.rmtree(session_dir)
        except FileNotFoundError:
            continue

def load_ai_status():
    """从 ai_config.json 加载 AI 启用状态与引擎模式。"""
    global ai_enabled, ai_mode
    try:
        config = read_ai_runtime_config(settings.data_root)
        ai_enabled = config["enabled"]
        ai_mode = config["ai_mode"]
    except Exception as e:
        ai_enabled = True
        ai_mode = AI_MODE_REMOTE
        print(f"[!] Error loading AI status: {e}")

# 初始化加载
load_ai_status()

def extract_manual_links(content: str) -> list[int]:
    """
    Extract note IDs from content.
    Matches: <span data-type="note-link" data-id="123">...</span>
    Also support any custom tiptap node output if needed.
    """
    if not content:
        return []
    
    # Match data-id="..." within tags that have data-type="note-link" or data-type="wiki"
    # The requirement mentioned <span data-type="note-link" data-id="123">
    pattern = r'data-id="(\d+)"'
    ids = re.findall(pattern, content)
    
    # Also look for data-wiki-id if we use that for WikiLink
    wiki_pattern = r'data-wiki-id="(\d+)"'
    ids.extend(re.findall(wiki_pattern, content))
    
    # Convert to unique integers
    return list(set(int(id_str) for id_str in ids))


def should_run_ai_indexing(llm_config: dict[str, str] | None) -> bool:
    return should_run_remote_ai_indexing(ai_enabled, ai_mode, llm_config)


def spawn_note_indexing(*args, **kwargs) -> None:
    global note_indexing_queue
    if not args:
        return
    note_id = int(args[0])
    if note_indexing_queue is None:
        note_indexing_queue = NoteIndexingQueue(background_index_note_task)
    note_indexing_queue.enqueue(note_id, *args[1:], **kwargs)

async def background_index_note_async(
    note_id: int,
    title: str,
    content: str,
    tags: list[str] | None = None,
    icon: str = "\U0001f4dd",
    type: str = "note",
    parent_id: int | None = None,
    is_title_manually_edited: bool = False,
    ai_client_instance: AIClient | None = None,
):
    """异步执行 AI 处理：摘要、向量化、自动链接"""
    if not ai_enabled:
        return
        
    db = SessionLocal()
    client = ai_client_instance or ai_client
    try:
        # 获取最新的 AI 配置
        model_config = get_or_create_model_config(db)
        llm_config = {
            "provider": model_config.provider,
            "api_key": model_config.api_key,
            "base_url": model_config.base_url,
            "model_name": model_config.model_name,
        }
        if not should_run_ai_indexing(llm_config):
            return
        
        # 1. 摘要处理
        summary = await client.summarize(content, llm_config)
        if not summary or summary.startswith("Error:"):
            return
        
        # 2. 更新数据库摘要 (这里不需要重复传入 content 以免大并发下覆盖新数据，但后端接口通常是全量)
        # 引入重试机制以应对可能的 SQLite 锁竞争
        from backend.database import with_db_retry
        @with_db_retry(max_retries=5, delay=0.5)
        def save_summary():
            update_note(db, note_id, title=title, content=content, summary=summary, tags=tags, icon=icon, type=type, parent_id=parent_id, is_title_manually_edited=is_title_manually_edited)
        
        save_summary()
        
        # 3. 向量索引处理
        chunks = chunk_text(content, settings.chunk_size_words, settings.chunk_overlap_words)
        records = []
        vector_store.delete_note_chunks(note_id)
        
        # 笔记级向量（基于摘要和前 3000 字）
        note_embedding = await client.embed(f"{title}\n{summary}\n{content[:3000]}", llm_config)
        
        for index, chunk in enumerate(chunks):
            embedding = await client.embed(chunk, llm_config)
            records.append({
                "id": f"note-{note_id}-chunk-{index}",
                "document": chunk,
                "embedding": embedding,
                "metadata": {"note_id": note_id, "title": title, "chunk_index": index},
            })
        
        if records:
            vector_store.upsert_chunks(records)
            
        # 4. 自动链接处理
        results = vector_store.search(note_embedding, top_k=6)
        link_targets: list[tuple[int, float]] = []
        seen_notes = {note_id}
        for item in results:
            target_id = item["metadata"]["note_id"]
            if target_id not in seen_notes and item["score"] >= 0.2:
                link_targets.append((target_id, item["score"]))
                seen_notes.add(target_id)
        
        if link_targets:
            @with_db_retry(max_retries=5, delay=0.5)
            def save_links():
                replace_note_links(db, note_id, sorted(link_targets, key=lambda pair: pair[1], reverse=True)[:5], link_type="ai")
            save_links()
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error in background indexing note {note_id}: {str(e)}")
        # In case of DB errors, we rollback the current session
        db.rollback()
    finally:
        db.close()


def background_index_note_task(*args, **kwargs):
    """BackgroundTasks 只能执行同步 callable；这里用一个 sync wrapper 安全执行协程。"""

    async def _run():
        # 背景任务中避免复用全局 ai_client（AsyncClient 跨 event loop/线程复用风险较高）
        local_ai_client = AIClient()
        try:
            # 临时替换全局引用：复用 background_index_note_async 的逻辑
            await background_index_note_async(*args, ai_client_instance=local_ai_client, **kwargs)
        finally:
            try:
                await local_ai_client.client.aclose()
            except Exception:
                pass

    asyncio.run(_run())


def note_to_response(note: Note) -> NoteResponse:
    links = [link.target_note_id for link in note.links_from if link.link_type == "manual"]
    ai_links = [link.target_note_id for link in note.links_from if link.link_type == "ai"]
    properties = [NotePropertyResponse.model_validate(p) for p in note.properties]
    return NoteResponse(
        id=note.id,
        title=note.title,
        file_path=getattr(note, "file_path", None),
        background_paper=getattr(note, "background_paper", None),
        sort_key=getattr(note, "sort_key", None),
        stickers=getattr(note, "stickers", []) or [],
        sticky_notes=getattr(note, "sticky_notes", []) or [],
        icon=note.icon,
        type=note.type,
        content=note.content,
        summary=note.summary,
        tags=[tag for tag in note.tags.split(",") if tag],
        properties=properties,
        links=links,
        ai_links=ai_links,
        notebook_id=note.notebook_id,
        parent_id=note.parent_id,
        position=note.position,
        is_title_manually_edited=(note.is_title_manually_edited == 1),
        is_folder=(note.is_folder == 1),
        created_at=note.created_at,
        deleted_at=note.deleted_at,
    )


def note_to_list_item_response(note: Note) -> NoteListItemResponse:
    links = [link.target_note_id for link in note.links_from if link.link_type == "manual"]
    ai_links = [link.target_note_id for link in note.links_from if link.link_type == "ai"]
    properties = [NotePropertyResponse.model_validate(p) for p in note.properties]
    return NoteListItemResponse(
        id=note.id,
        title=note.title,
        file_path=getattr(note, "file_path", None),
        background_paper=getattr(note, "background_paper", None),
        sort_key=getattr(note, "sort_key", None),
        stickers=getattr(note, "stickers", []) or [],
        sticky_notes=getattr(note, "sticky_notes", []) or [],
        icon=note.icon,
        type=note.type,
        summary=note.summary,
        tags=[tag for tag in note.tags.split(",") if tag],
        properties=properties,
        links=links,
        ai_links=ai_links,
        notebook_id=note.notebook_id,
        parent_id=note.parent_id,
        position=note.position,
        is_title_manually_edited=(note.is_title_manually_edited == 1),
        is_folder=(note.is_folder == 1),
        created_at=note.created_at,
        deleted_at=note.deleted_at,
    )

def note_to_tree_response(note: Note) -> NoteTreeResponse:
    # 树形列表默认不返回 content，避免大字段导致的网络/内存开销
    resp = note_to_list_item_response(note)
    children = [note_to_tree_response(child) for child in note.children if child.deleted_at is None]
    return NoteTreeResponse(
        **resp.model_dump(),
        children=children,
    )

def notebook_to_response(notebook: Notebook) -> NotebookResponse:
    return NotebookResponse.model_validate(notebook)

def persist_note_sync(
    db: Session,
    title: str,
    content: str,
    background_tasks: BackgroundTasks,
    notebook_id: int | None = None,
    icon: str = "\U0001f4dd",
    type: str = "note",
    parent_id: int | None = None,
    is_title_manually_edited: bool = False,
    tags: list[str] | None = None,
    background_paper: str | None = None,
    sort_key: str | None = None,
    stickers: list[dict] | None = None,
    sticky_notes: list[dict] | None = None,
    properties: list | None = None,
) -> NoteResponse:
    # 1. 快速创建数据库记录
    from backend.database import with_db_retry
    
    @with_db_retry(max_retries=3)
    def do_create():
        nonlocal notebook_id
        notebook_id = notebook_id or get_or_create_default_notebook(db).id
        return create_note(
            db,
            title=title,
            content=content,
            summary="",
            tags=tags,
            notebook_id=notebook_id,
            icon=icon,
            type=type,
            parent_id=parent_id,
            is_title_manually_edited=is_title_manually_edited,
            background_paper=background_paper,
            sort_key=sort_key,
            stickers=stickers,
            sticky_notes=sticky_notes,
            properties=properties,
        )
    
    note = do_create()
    
    # 1.5 Parse and save manual links
    manual_link_ids = extract_manual_links(content)
    if manual_link_ids:
        replace_note_links(db, note.id, [(tid, 1.0) for tid in manual_link_ids], link_type="manual")
    
    # 2. 异步执行 AI 任务
    spawn_note_indexing(
        note.id,
        title,
        content,
        tags=tags,
        icon=icon,
        type=type,
        parent_id=parent_id,
        is_title_manually_edited=is_title_manually_edited,
    )
    
    return note_to_response(note)

def get_or_create_thumbnail(file_path: Path) -> str | None:
    """如果文件是动图且没有缩略图，则生成并返回缩略图文件名；否则返回 None。"""
    if file_path.suffix.lower() not in [".gif", ".webp"] or file_path.name.endswith(".thumb.png"):
        return None
    
    thumb_name = f"{file_path.stem}.thumb.png"
    thumb_path = file_path.parent / thumb_name
    
    if not thumb_path.exists():
        try:
            with Image.open(file_path) as img:
                # 提取第一帧并保存
                img.seek(0)
                # 转换到 RGBA (针对带有透明度的 WebP/GIF) 并保存为 PNG
                img.convert("RGBA").save(thumb_path, "PNG")
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to generate thumbnail for {file_path}: {e}")
            return None
            
    return thumb_name

@router.get("/emoticons/list", response_model=list[dict])
def list_emoticons():
    """获取表情包资源列表"""
    emoticons_path = Path(settings.emoticons_path)
    if not emoticons_path.exists():
        emoticons_path.mkdir(parents=True, exist_ok=True)
    
    files = []
    # 支持常见的图片格式
    extensions = ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.svg"]
    for ext in extensions:
        for f in emoticons_path.glob(ext):
            # 排除生成的缩略图文件本身被列出
            if f.name.endswith(".thumb.png"):
                continue
                
            url = f"/api/emoticons/static/files/{f.name}"
            thumb_url = url
            
            # 动图特殊处理
            if f.suffix.lower() in [".gif", ".webp"]:
                thumb_name = get_or_create_thumbnail(f)
                if thumb_name:
                    thumb_url = f"/api/emoticons/static/files/{thumb_name}"
            
            files.append({
                "name": f.name,
                "url": url,
                "thumb_url": thumb_url
            })
            
    return sorted(files, key=lambda x: x["name"])

@router.post("/notes/quick-capture", response_model=QuickCaptureResponse)
def quick_capture_api(payload: QuickCaptureRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> QuickCaptureResponse:
    from datetime import datetime
    title = f"灵感碎片 - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # 1. 确保 Inbox 笔记本存在
    inbox = get_or_create_inbox_notebook(db)
    
    # 2. 持久化笔记
    note_resp = persist_note_sync(db, title, payload.content, background_tasks, notebook_id=inbox.id, icon="⚡", type="note")
    
    # 3. 增加 EXP
    exp_gained = 10
    stats = add_exp(db, exp_gained)
    
    return QuickCaptureResponse(
        status="success",
        note=note_resp,
        exp_gained=exp_gained,
        current_exp=stats.exp,
        current_level=stats.level
    )

@router.get("/user/stats", response_model=UserStatsResponse)
def get_user_stats_api(db: Session = Depends(get_db)) -> UserStatsResponse:
    stats = get_or_create_user_stats(db)
    # 每次获取 stats 时检查是否有新成就解锁
    check_and_unlock_achievements(db)
    return UserStatsResponse.model_validate(stats)


@router.get("/user/achievements", response_model=list[UserAchievementResponse])
def get_user_achievements_api(db: Session = Depends(get_db)) -> list[UserAchievementResponse]:
    return [UserAchievementResponse.model_validate(ua) for ua in list_user_achievements(db)]


@router.patch("/user/theme", response_model=UserStatsResponse)
def update_user_theme_api(payload: ThemeUpdatePayload, db: Session = Depends(get_db)) -> UserStatsResponse:
    stats = update_user_theme(db, payload.theme)
    return UserStatsResponse.model_validate(stats)


from pydantic import BaseModel
class WallpaperUpdatePayload(BaseModel):
    wallpaper_url: str

@router.patch("/user/wallpaper", response_model=UserStatsResponse)
def update_user_wallpaper_api(payload: WallpaperUpdatePayload, db: Session = Depends(get_db)) -> UserStatsResponse:
    stats = update_user_wallpaper(db, payload.wallpaper_url)
    return UserStatsResponse.model_validate(stats)



@router.post("/upload", response_model=UploadResponse)
async def upload_documents(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...), db: Session = Depends(get_db)) -> UploadResponse:
    imported: list[NoteResponse] = []
    default_notebook = get_or_create_default_notebook(db)
    for file in files:
        content = await read_upload_file_limited(file)
        title, parsed = parse_document(file.filename, content)
        imported.append(persist_note_sync(db, title, parsed, background_tasks, default_notebook.id))
    return UploadResponse(imported_notes=imported)

@router.post("/media/upload")
async def upload_media_api(file: UploadFile = File(...), note_id: str = Form(None)):
    try:
        ext = os.path.splitext(file.filename)[1]
        unique_name = f"{uuid.uuid4()}{ext}"
        
        upload_base = safe_media_subdir(settings.uploads_path, note_id)
        upload_base.mkdir(parents=True, exist_ok=True)
            
        save_path = upload_base / unique_name
        content = await read_upload_file_limited(file)
        await run_in_threadpool(save_path.write_bytes, content)
            
        url_path = f"{note_id}/{unique_name}" if note_id else unique_name
        return {
            "url": f"/api/media/static/files/{url_path}",
            "name": file.filename,
            "size": save_path.stat().st_size,
            "type": getattr(file, "content_type", None)
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/media/upload/init")
def upload_media_init(
    filename: str = Form(...),
    size: int = Form(...),
    note_id: str = Form(None),
    total_chunks: int | None = Form(None),
    file_sha256: str | None = Form(None),
):
    cleanup_expired_upload_sessions()
    upload_id = str(uuid.uuid4())
    safe_media_subdir(settings.uploads_path, note_id)
    temp_dir = safe_named_file(Path(settings.uploads_path) / "temp", upload_id, detail="Invalid upload_id")
    temp_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "filename": filename,
        "size": size,
        "note_id": note_id,
        "total_chunks": total_chunks,
        "file_sha256": file_sha256,
    }
    (temp_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return {"upload_id": upload_id}

@router.get("/media/upload/status/{upload_id}")
def upload_media_status(upload_id: str):
    upload_id = validate_uuid(upload_id, "upload_id")
    temp_dir = safe_named_file(Path(settings.uploads_path) / "temp", upload_id, detail="Invalid upload_id")
    if not temp_dir.exists():
        raise HTTPException(status_code=404, detail="Invalid upload_id")

    chunk_pattern = re.compile(r"^chunk_(\d+)$")
    uploaded_chunks: list[int] = []
    for chunk_path in temp_dir.iterdir():
        match = chunk_pattern.match(chunk_path.name)
        if match:
            uploaded_chunks.append(int(match.group(1)))

    uploaded_chunks.sort()
    return {"upload_id": upload_id, "uploaded_chunks": uploaded_chunks}

@router.post("/media/upload/chunk")
async def upload_media_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    note_id: str = Form(None),
    chunk_sha256: str | None = Form(None),
):
    upload_id = validate_uuid(upload_id, "upload_id")
    temp_dir = safe_named_file(Path(settings.uploads_path) / "temp", upload_id, detail="Invalid upload_id")
    if not temp_dir.exists():
        raise HTTPException(status_code=400, detail="Invalid upload_id")
    content = await read_upload_file_limited(file)
    if chunk_sha256:
        actual_sha = hashlib.sha256(content).hexdigest()
        if actual_sha.lower() != chunk_sha256.lower():
            raise HTTPException(status_code=400, detail=f"Chunk checksum mismatch: {chunk_index}")
    chunk_path = temp_dir / f"chunk_{chunk_index}"
    await run_in_threadpool(chunk_path.write_bytes, content)
    return {"status": "ok"}

@router.post("/media/upload/complete")
async def upload_media_complete(
    upload_id: str = Form(...),
    filename: str = Form(...),
    content_type: str = Form(...),
    note_id: str = Form(None),
    total_chunks: int | None = Form(None),
    file_sha256: str | None = Form(None),
):
    upload_id = validate_uuid(upload_id, "upload_id")
    temp_dir = safe_named_file(Path(settings.uploads_path) / "temp", upload_id, detail="Invalid upload_id")
    if not temp_dir.exists():
        raise HTTPException(status_code=400, detail="Invalid upload_id")
    
    ext = os.path.splitext(filename)[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    
    upload_base = safe_media_subdir(settings.uploads_path, note_id)
    upload_base.mkdir(parents=True, exist_ok=True)
        
    final_path = upload_base / unique_name
    
    chunks = sorted(temp_dir.glob("chunk_*"), key=lambda p: int(p.name.split("_")[1]))
    if total_chunks is not None and len(chunks) != total_chunks:
        raise HTTPException(status_code=400, detail="Chunk count mismatch")

    def merge_chunks_and_verify():
        file_hasher = hashlib.sha256() if file_sha256 else None
        with open(final_path, "wb") as outfile:
            for chunk_path in chunks:
                with open(chunk_path, "rb") as infile:
                    while True:
                        chunk = infile.read(1024 * 1024)
                        if not chunk:
                            break
                        outfile.write(chunk)
                        if file_hasher:
                            file_hasher.update(chunk)

        if file_sha256:
            actual_sha = file_hasher.hexdigest()
            if actual_sha.lower() != file_sha256.lower():
                final_path.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="File checksum mismatch")

    await run_in_threadpool(merge_chunks_and_verify)
    
    shutil.rmtree(temp_dir)
    url_path = f"{note_id}/{unique_name}" if note_id else unique_name
    return {
        "url": f"/api/media/static/files/{url_path}",
        "name": filename,
        "size": final_path.stat().st_size,
        "type": content_type
    }

@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_import_files(files: list[UploadFile] = File(...)) -> ImportPreviewResponse:
    items: list[ImportPreviewItem] = []
    for file in files:
        content = await read_upload_file_limited(file)
        items.append(ImportPreviewItem(**build_import_preview_item(file.filename, content)))
    return ImportPreviewResponse(items=items)


@router.post("/import/url/preview", response_model=ImportPreviewResponse)
async def preview_import_urls(payload: ImportUrlRequest) -> ImportPreviewResponse:
    items: list[ImportPreviewItem] = []
    for url in payload.urls:
        try:
            article = await fetch_url_article(url)
            items.append(ImportPreviewItem(**build_url_preview_item(article["url"], article["html"])))
        except Exception as error:
            items.append(
                ImportPreviewItem(
                    file_name=url,
                    file_type="url",
                    size=0,
                    title=url,
                    status="error",
                    message=str(error),
                    summary="",
                    block_count=0,
                )
            )
    return ImportPreviewResponse(items=items)


@router.post("/import/generate-note", response_model=GeneratedNoteResponse)
async def import_and_generate_note(
    files: list[UploadFile] = File(...),
    template_id: str = Form("general"),
    db: Session = Depends(get_db),
) -> GeneratedNoteResponse:
    documents: list[dict[str, str]] = []
    for file in files:
        content = await read_upload_file_limited(file)
        title, parsed = parse_document(file.filename, content)
        documents.append({"file_name": file.filename, "title": title, "content": parsed})

    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    result = await generate_note_from_imported_documents(
        documents=documents,
        template_id=template_id,
        ai_client=ai_client,
        llm_config=llm_config,
    )
    return GeneratedNoteResponse(**result)


@router.post("/import/url/generate-note", response_model=GeneratedNoteResponse)
async def import_urls_and_generate_note(payload: ImportUrlRequest, db: Session = Depends(get_db)) -> GeneratedNoteResponse:
    documents: list[dict[str, str]] = []
    for url in payload.urls:
        article = await fetch_url_article(url)
        documents.append({"url": article["url"], "title": article["title"], "content": article["content"]})

    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    normalized = combine_imported_urls_for_note_generation(documents, template_id=payload.template_id)
    result = await generate_structured_note(normalized, ai_client, llm_config)
    return GeneratedNoteResponse(**result)


@router.post("/ai/generate-note-from-content", response_model=GeneratedNoteResponse)
async def generate_note_from_content(payload: NormalizedContentPayload, db: Session = Depends(get_db)) -> GeneratedNoteResponse:
    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    result = await generate_structured_note(payload.model_dump(), ai_client, llm_config)
    return GeneratedNoteResponse(**result)


@router.post("/ai/generate-note-from-content/persist", response_model=GeneratedNotePersistResponse)
async def generate_and_persist_note_from_content(
    payload: NormalizedContentPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> GeneratedNotePersistResponse:
    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    result = await generate_structured_note(payload.model_dump(), ai_client, llm_config)
    generated = GeneratedNoteResponse(**result)
    note = persist_note_sync(
        db,
        generated.title,
        generated.markdown,
        background_tasks,
        icon="🤖",
        tags=["AI整理"],
    )
    return GeneratedNotePersistResponse(generated=generated, note=note)


@router.post("/ask", response_model=AskResponse)
async def ask_question(payload: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
    if not ai_enabled:
        return AskResponse(answer="AI is disabled in settings.", citations=[], mode=payload.mode)
        
    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    
    if payload.mode == "agent":
        agent_response = await run_agent(db, payload.question, ai_client)
        return AskResponse(answer=agent_response.answer, citations=agent_response.evidence, mode="agent")
    elif payload.mode == "chat":
        answer = await ai_client.answer(payload.question, [], llm_config)
        return AskResponse(answer=answer, citations=[], mode="chat")
    else:
        results = await search_knowledge(payload.question, ai_client=ai_client)
        citations = await run_in_threadpool(citations_from_results, db, results)
        citations = filter_relevant_vault_citations(citations, payload.question)
        if not citations:
            citations = await run_in_threadpool(build_vault_fallback_citations, db, payload.question)
        answer = await ai_client.answer(payload.question, citations, llm_config)
        return AskResponse(answer=answer, citations=[Citation(**item) for item in citations], mode="rag")


def build_import_batch_citations(notes) -> list[dict]:
    citations: list[dict] = []
    for note in notes:
        content = getattr(note, "content", "") or ""
        if not content.strip():
            continue
        citations.append(
            {
                "note_id": int(note.id),
                "title": note.title,
                "chunk_id": f"import-batch-{note.id}",
                "score": 1.0,
                "excerpt": content[:1200],
            }
        )
    return citations


def build_note_citation(note) -> dict | None:
    content = getattr(note, "content", "") or ""
    if not content.strip():
        return None
    return {
        "note_id": int(note.id),
        "title": note.title,
        "chunk_id": f"note-{note.id}",
        "score": 1.0,
        "excerpt": content[:1800],
    }


def _plain_note_text(content: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", content or "", flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


_CJK_QUERY_STOP_TERMS = {
    "还有", "哪些", "哪个", "什么", "怎么", "如何", "是否", "关于", "有关", "相关",
    "笔记", "内容", "当前", "全部", "全库", "知识", "知识库", "这个", "那个", "一些",
    "可以", "不能", "需要", "进行", "里面", "中的", "的是", "以及", "或者", "如果",
}


def _query_terms(question: str) -> set[str]:
    terms = {
        term.lower()
        for term in re.findall(r"[A-Za-z0-9_]{2,}", question or "")
    }
    cjk_runs = re.findall(r"[\u4e00-\u9fff]{2,}", question or "")
    for run in cjk_runs:
        if 2 <= len(run) <= 6:
            terms.add(run.lower())
        for size in (2, 3, 4):
            for index in range(0, max(0, len(run) - size + 1)):
                terms.add(run[index:index + size].lower())
    return {
        term for term in terms
        if term not in _CJK_QUERY_STOP_TERMS
        and not any(stop in term for stop in _CJK_QUERY_STOP_TERMS if len(term) <= 4)
    }


def _citation_term_overlap(citation: dict, terms: set[str]) -> int:
    if not terms:
        return 0
    haystack = f"{citation.get('title', '')} {citation.get('excerpt', '')}".lower()
    return sum(1 for term in terms if term in haystack)


def filter_relevant_vault_citations(citations: list[dict], question: str, *, limit: int = 2) -> list[dict]:
    if not citations:
        return []

    terms = _query_terms(question)
    scored = [
        {
            **citation,
            "_term_overlap": _citation_term_overlap(citation, terms),
        }
        for citation in sorted(citations, key=lambda item: float(item.get("score") or 0), reverse=True)
    ]

    top_score = float(scored[0].get("score") or 0)
    min_score = max(0.25, top_score * 0.9, top_score - 0.06)
    min_overlap = 1 if len(terms) <= 2 else 2
    filtered = [scored[0]]
    seen_note_ids = {scored[0].get("note_id")}

    for item in scored[1:]:
        note_id = item.get("note_id")
        if note_id in seen_note_ids:
            continue
        item_score = float(item.get("score") or 0)
        if terms and int(item.get("_term_overlap") or 0) < min_overlap:
            continue
        if top_score > 0 and item_score < min_score:
            continue
        filtered.append(item)
        seen_note_ids.add(note_id)
        if len(filtered) >= min(limit, 2):
            break

    return [
        {key: value for key, value in item.items() if key != "_term_overlap"}
        for item in filtered
    ]


def build_vault_fallback_citations(
    db: Session,
    question: str,
    *,
    limit: int = 6,
) -> list[dict]:
    notes = [
        note for note in list_notes(db, include_content=True)
        if not getattr(note, "is_folder", False)
        and not getattr(note, "deleted_at", None)
        and _plain_note_text(getattr(note, "content", "") or "")
    ]
    if not notes:
        return []

    query_terms = _query_terms(question)

    def score_note(note) -> tuple[int, str]:
        title = getattr(note, "title", "") or ""
        text = _plain_note_text(getattr(note, "content", "") or "")
        haystack = f"{title} {text}".lower()
        overlap = sum(1 for term in query_terms if term in haystack)
        updated_at = str(getattr(note, "updated_at", "") or getattr(note, "created_at", "") or "")
        return overlap, updated_at

    ranked_notes = sorted(notes, key=score_note, reverse=True)
    if query_terms:
        ranked_notes = [note for note in ranked_notes if score_note(note)[0] > 0]
    return [
        {
            "note_id": int(note.id),
            "title": note.title,
            "chunk_id": f"vault-fallback-{note.id}",
            "score": float(score_note(note)[0]),
            "excerpt": _plain_note_text(getattr(note, "content", "") or "")[:1800],
        }
        for note in ranked_notes[:limit]
    ]


@router.post("/import/batches/{batch_id}/ask", response_model=AskResponse)
async def ask_import_batch(batch_id: str, payload: ImportBatchAskRequest, db: Session = Depends(get_db)) -> AskResponse:
    if not ai_enabled:
        return AskResponse(answer="AI is disabled in settings.", citations=[], mode="import_batch")

    property_filter = {"import_batch_id": batch_id}
    notes = list_notes(db, property_filter, include_content=True)
    citations = build_import_batch_citations(notes)
    if not citations:
        return AskResponse(answer="No notes were found for this import batch.", citations=[], mode="import_batch")

    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    answer = await ai_client.answer(payload.question, citations, llm_config)
    return AskResponse(answer=answer, citations=[Citation(**item) for item in citations], mode="import_batch")


@router.post("/notes/{note_id}/ask", response_model=AskResponse)
async def ask_note(note_id: int, payload: ImportBatchAskRequest, db: Session = Depends(get_db)) -> AskResponse:
    if not ai_enabled:
        return AskResponse(answer="AI is disabled in settings.", citations=[], mode="note")

    note = get_note(db, note_id)
    if not note or getattr(note, "deleted_at", None):
        raise HTTPException(status_code=404, detail="Note not found")

    citation = build_note_citation(note)
    if not citation:
        return AskResponse(answer="This note has no readable content yet.", citations=[], mode="note")

    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    answer = await ai_client.answer(payload.question, [citation], llm_config)
    return AskResponse(answer=answer, citations=[Citation(**citation)], mode="note")


@router.post("/search")
async def search_api(payload: SearchRequest, db: Session = Depends(get_db)) -> dict:
    if not ai_enabled:
        return {"results": []}
        
    results = await search_knowledge(payload.query, ai_client=ai_client, top_k=payload.top_k)
    return {"results": await run_in_threadpool(citations_from_results, db, results)}

@router.post("/ai/inline")
async def inline_ai(payload: InlineAIRequest, db: Session = Depends(get_db)):
    global ai_enabled
    if not ai_enabled:
        return StreamingResponse(iter([f"data: {{\"error\": \"AI is disabled in settings.\"}}\n\n"]), media_type="text/event-stream")
        
    markdown_output_rules = (
        "\n\nOutput format rules: Return only clean Markdown content that can be inserted into a note editor. "
        "Do not explain the format. Do not wrap the whole answer in a Markdown code fence. "
        "Use headings, bullet lists, numbered lists, bold text, blockquotes, inline code and code blocks only when helpful. "
        "Do not output raw HTML unless the user explicitly asks for HTML."
    )
    system_prompts = {
        "continue": "You are a writing assistant. Continue writing the following text naturally. Return only the new text.",
        "expand": "You are a writing assistant. Expand the following text with more details and depth. Return only the expanded version.",
        "summarize": "You are a writing assistant. Summarize the following text concisely. Return only the summary.",
        "rewrite": "You are a writing assistant. Rewrite the following text to be more professional and clear. Return only the rewritten text.",
        "translate": "You are a writing assistant. Translate the following text to Chinese (if it is English) or English (if it is Chinese). Return only the translation.",
        "outline": "You are a writing assistant. Generate a structured outline for the following topic or text. Return only the outline.",
        "ask": "You are a note-taking and personal knowledge base assistant. Based on the selected text and context, answer the user's intent or improve the text accordingly. Return only the result.",
    }
    messages = [
        {"role": "system", "content": system_prompts.get(payload.action, "You are a helpful writing assistant.") + markdown_output_rules},
        {"role": "user", "content": f"Context: {payload.context or ''}\n\nInput: {payload.prompt}"}
    ]

    if ai_mode == AI_MODE_LOCAL:
        if not local_ai_manager.is_ready:
            await local_ai_manager.initialize_model()
        if local_ai_manager.is_ready:
            return StreamingResponse(
                local_ai_manager.generate_chat_stream(
                    prompt=payload.prompt,
                    context=payload.context,
                    action=payload.action
                ),
                media_type="text/event-stream",
                headers={
                    "X-Accel-Buffering": "no",
                    "Cache-Control": "no-cache, no-transform",
                    "Connection": "keep-alive",
                    "Content-Type": "text/event-stream"
                }
            )

        status = local_ai_manager.get_status()
        if status.get("is_loading"):
            return StreamingResponse(iter(['data: {"text": "Local AI model is still loading, please wait..."}\n\n']), media_type="text/event-stream")
        error_msg = status.get("error") or "Local AI model is not ready."
        return StreamingResponse(iter([f'data: {json.dumps({"error": error_msg}, ensure_ascii=False)}\n\n']), media_type="text/event-stream")

    model_config = await run_in_threadpool(get_or_create_model_config, db)
    if not model_config.api_key or not model_config.base_url:
        return StreamingResponse(iter([f"data: {{\"error\": \"AI Config missing (API Key or Base URL is empty). Please check your settings.\"}}\n\n"]), media_type="text/event-stream")
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    
    async def generate():
        try:
            async for chunk in ai_client.stream_chat(messages, llm_config):
                if isinstance(chunk, str) and chunk.lstrip().startswith("data:"):
                    yield chunk
                    if '"error"' in chunk:
                        return
                    continue
                yield f'data: {json.dumps({"text": chunk}, ensure_ascii=False)}\n\n'
            yield 'data: [DONE]\n\n'
        except Exception as e:
            error_msg = f"Inline AI Error: {str(e)}"
            yield f'data: {json.dumps({"error": error_msg})}\n\n'
    return StreamingResponse(
        generate(), 
        media_type="text/event-stream", 
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.post("/chat")
async def global_chat(payload: AskRequest, db: Session = Depends(get_db)):
    if not ai_enabled:
        return StreamingResponse(iter(["AI is disabled in settings."]), media_type="text/plain")
        
    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    
    if payload.mode == "rag":
        results = await search_knowledge(payload.question, ai_client=ai_client, top_k=5)
        citations = await run_in_threadpool(citations_from_results, db, results)
        citations = filter_relevant_vault_citations(citations, payload.question)
        if not citations:
            citations = await run_in_threadpool(build_vault_fallback_citations, db, payload.question, limit=5)
        citation_block = "\n\n".join(
            f"[{idx + 1}] {item['title']}\n{item['excerpt']}" for idx, item in enumerate(citations)
        )
        messages = [
            {"role": "system", "content": "You are a personal second-brain assistant. Answer using the provided notes only. Always cite sources as [1], [2] inline."},
            {"role": "user", "content": f"Question: {payload.question}\n\nContext:\n{citation_block}"}
        ]
    else:
        citations = []
        messages = [
            {"role": "system", "content": "You are a helpful second-brain assistant."},
            {"role": "user", "content": payload.question}
        ]
        
    async def generate():
        try:
            if payload.mode == "rag":
                import json
                yield f"__CITATIONS__:{json.dumps(citations)}\n"
            if ai_mode == AI_MODE_LOCAL:
                if not local_ai_manager.is_ready:
                    await local_ai_manager.initialize_model()
                async for chunk in local_ai_manager.generate_chat_stream_messages(messages):
                    yield chunk
                return
            async for chunk in ai_client.stream_chat(messages, llm_config):
                yield chunk
        except Exception as e:
            import json
            error_msg = f"Streaming Error: {str(e)}"
            yield f'data: {json.dumps({"error": error_msg})}\n\n'
            
    return StreamingResponse(
        generate(), 
        media_type="text/plain", 
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.post("/tags/suggest", response_model=TagSuggestResponse)
async def suggest_tags(payload: TagSuggestRequest, db: Session = Depends(get_db)):
    if not ai_enabled:
        return TagSuggestResponse(tags=[])
        
    model_config = await run_in_threadpool(get_or_create_model_config, db)
    llm_config = {
        "provider": model_config.provider,
        "api_key": model_config.api_key,
        "base_url": model_config.base_url,
        "model_name": model_config.model_name,
    }
    tags = await ai_client.tags(payload.content, llm_config)
    return TagSuggestResponse(tags=tags)

from backend.services.spellcheck_engine import spellcheck_engine

@router.post("/text/spellcheck")
async def text_spellcheck(payload: dict):
    """Text Spellcheck using pure rule engine (NOT gated by AI plugin toggle)"""
    text = payload.get("text", "")
    if not text:
        return {"errors": []}

    try:
        # 纯规则引擎：高性能、可控、无模型依赖
        errors = spellcheck_engine.check(text)
        return {"errors": errors}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error in spellcheck_engine: {str(e)}")
        return {"errors": []}

@router.post("/text/dictionary/import")
async def import_dictionary(payload: dict):
    """导入用户自定义词库文本并触发热更新"""
    text = payload.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    
    try:
        count = spellcheck_engine.import_from_text(text)
        return {"status": "success", "count": count, "message": f"Successfully imported {count} rules"}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Error importing dictionary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Backward compatible route (historical naming). Keep it but DO NOT gate by ai_enabled.
@router.post("/ai/spellcheck")
async def ai_spellcheck(payload: dict):
    return await text_spellcheck(payload)

@router.post("/ai/suggest-tags")
async def ai_suggest_tags(payload: dict):
    """AI 智能标签建议"""
    if not ai_enabled:
        return {"tags": []}
        
    content = payload.get("content", "")
    if not content:
        return {"tags": []}
    
    # 构造 Prompt
    prompt = f"Generate up to 3 tags, each max 5 characters long, based on the following text. Return them as a comma-separated string only.\n\nText: {content[:1000]}"
    
    full_response = ""
    try:
        # 使用 blocking equivalent (collecting stream)
        async for chunk in local_ai_manager.generate_chat_stream_messages([
            {"role": "system", "content": "You are a tagging assistant. Return ONLY a comma-separated list of tags."},
            {"role": "user", "content": prompt}
        ]):
            full_response += chunk
            
        # 解析结果
        tags = [t.strip() for t in full_response.split(",") if t.strip()]
        # 限制长度和数量
        tags = [t[:5] for t in tags][:3]
        
        return {"tags": tags}
    except Exception as e:
        print(f"[!] Error suggesting tags: {e}")
        return {"tags": []}

@router.get("/notes/{note_id}/links", response_model=list[NoteResponse])
def get_note_links(note_id: int, db: Session = Depends(get_db)) -> list[NoteResponse]:
    """获取当前笔记引用了哪些笔记"""
    note = get_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # 结合手动和 AI 链接
    target_ids = {link.target_note_id for link in note.links_from}
    if not target_ids:
        return []
    
    notes = db.scalars(select(Note).where(Note.id.in_(target_ids), Note.deleted_at.is_(None))).all()
    return [note_to_response(n) for n in notes]

@router.get("/notes/{note_id}/backlinks", response_model=list[NoteResponse])
def get_note_backlinks(note_id: int, db: Session = Depends(get_db)) -> list[NoteResponse]:
    """获取有哪些笔记引用了当前笔记"""
    note = get_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # 从 NoteLink 表中查询 target_note_id 为当前笔记的记录
    source_ids = {link.source_note_id for link in note.links_to}
    if not source_ids:
        return []
    
    notes = db.scalars(select(Note).where(Note.id.in_(source_ids), Note.deleted_at.is_(None))).all()
    return [note_to_response(n) for n in notes]

@router.get("/notes/tree", response_model=list[NoteTreeResponse])
def get_notes_tree(db: Session = Depends(get_db)) -> list[NoteTreeResponse]:
    # 树形接口也不返回 content
    roots = list_notes_tree(db, include_content=False)
    return [note_to_tree_response(note) for note in roots]

@router.post("/folders", response_model=NoteResponse)
def create_folder_api(payload: NoteCreate, db: Session = Depends(get_db)) -> NoteResponse:
    from backend.database import with_db_retry
    @with_db_retry(max_retries=3)
    def do_create():
        notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
        return create_note(db, title=payload.title, content="", summary="", tags=payload.tags, notebook_id=notebook_id, icon="📂", type=payload.type, parent_id=payload.parent_id, is_folder=True)
    
    folder = do_create()
    return note_to_response(folder)

@router.get("/notes/{note_id}", response_model=NoteResponse)
def get_note_api(note_id: int, db: Session = Depends(get_db)) -> NoteResponse:
    """获取单条笔记详情（含 content）"""
    note = get_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)


@router.get("/notes", response_model=list[NoteListItemResponse])
def get_notes(property_name: str | None = None, property_value: str | None = None, db: Session = Depends(get_db)) -> list[NoteListItemResponse]:
    filter_dict = None
    if property_name and property_value:
        filter_dict = {property_name: property_value}
    # 列表接口默认不返回 content 以优化性能
    notes = list_notes(db, filter_dict, include_content=False)
    return [note_to_list_item_response(note) for note in notes]

@router.get("/notes/{note_id}/properties", response_model=list[NotePropertyResponse])
def get_note_properties_api(note_id: int, db: Session = Depends(get_db)) -> list[NotePropertyResponse]:
    return [NotePropertyResponse.model_validate(p) for p in get_note_properties(db, note_id)]

@router.post("/notes/{note_id}/properties", response_model=NotePropertyResponse)
def create_note_property_api(note_id: int, payload: NotePropertyCreate, db: Session = Depends(get_db)) -> NotePropertyResponse:
    return NotePropertyResponse.model_validate(create_note_property(db, note_id, payload.name, payload.type, payload.value))

@router.patch("/notes/{note_id}/properties/{property_id}", response_model=NotePropertyResponse)
def update_note_property_api(note_id: int, property_id: int, payload: NotePropertyUpdate, db: Session = Depends(get_db)) -> NotePropertyResponse:
    prop = update_note_property(db, property_id, payload.name, payload.type, payload.value)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return NotePropertyResponse.model_validate(prop)

@router.delete("/notes/{note_id}/properties/{property_id}")
def delete_note_property_api(note_id: int, property_id: int, db: Session = Depends(get_db)) -> dict:
    if not delete_note_property(db, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    return {"status": "ok"}

@router.get("/trash", response_model=TrashResponse)
def get_trash(db: Session = Depends(get_db)) -> TrashResponse:
    return TrashResponse(
        notes=[note_to_response(note) for note in list_trashed_notes(db)],
        notebooks=[notebook_to_response(notebook) for notebook in list_trashed_notebooks(db)],
    )

@router.get("/notebooks", response_model=list[NotebookResponse])
def get_notebooks(db: Session = Depends(get_db)) -> list[NotebookResponse]:
    get_or_create_default_notebook(db)
    return [notebook_to_response(notebook) for notebook in list_notebooks(db)]

@router.post("/notebooks", response_model=NotebookResponse)
def create_notebook_api(payload: NotebookCreate, db: Session = Depends(get_db)) -> NotebookResponse:
    return notebook_to_response(create_notebook(db, payload.name, payload.icon))

@router.patch("/notebooks/{notebook_id}", response_model=NotebookResponse)
def update_notebook_api(notebook_id: int, payload: NotebookUpdate, db: Session = Depends(get_db)) -> NotebookResponse:
    notebook = update_notebook(db, notebook_id, payload.name, payload.icon)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook_to_response(notebook)

@router.delete("/notebooks/{notebook_id}")
def delete_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> dict:
    active_note_ids = [
        note.id for note in list_notes(db, include_content=False)
        if note.notebook_id == notebook_id and not note.is_folder
    ]
    notebook = soft_delete_notebook(db, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or cannot delete default notebook")
    _delete_vector_chunks_for_notes(active_note_ids)
    return {"status": "ok"}

@router.post("/notebooks/{notebook_id}/restore", response_model=NotebookResponse)
def restore_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> NotebookResponse:
    notebook = restore_notebook(db, notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook_to_response(notebook)

@router.delete("/notebooks/{notebook_id}/purge")
def purge_notebook_api(notebook_id: int, db: Session = Depends(get_db)) -> dict:
    trashed_note_ids = [
        note.id for note in list_trashed_notes(db)
        if note.notebook_id == notebook_id and not note.is_folder
    ]
    if not purge_notebook(db, notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found or cannot purge default notebook")
    _delete_vector_chunks_for_notes(trashed_note_ids)
    return {"status": "ok"}

@router.post("/notes", response_model=NoteResponse)
def create_note_api(payload: NoteCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> NoteResponse:
    return persist_note_sync(
        db,
        payload.title,
        payload.content or "",
        background_tasks,
        payload.notebook_id,
        payload.icon,
        payload.type,
        payload.parent_id,
        payload.is_title_manually_edited,
        payload.tags,
        payload.background_paper,
        payload.sort_key,
        payload.stickers,
        payload.sticky_notes,
        payload.properties,
    )

@router.put("/notes/{note_id}", response_model=NoteResponse)
def update_note_api(note_id: int, payload: NoteUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> NoteResponse:
    existing = get_note(db, note_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # 1. 快速更新基本信息 (主流程只做极速的存储操作)
    update_data = payload.model_dump(exclude_unset=True)
    
    title = update_data.get("title", existing.title)
    content = update_data.get("content", existing.content)
    background_paper = update_data.get("background_paper", getattr(existing, "background_paper", None))
    sort_key = update_data.get("sort_key", getattr(existing, "sort_key", None))
    stickers = update_data.get("stickers", getattr(existing, "stickers", None))
    sticky_notes = update_data.get("sticky_notes", getattr(existing, "sticky_notes", None))
    icon = update_data.get("icon", existing.icon)
    type = update_data.get("type", existing.type)
    parent_id = update_data.get("parent_id", existing.parent_id)
    is_title_manually_edited = update_data.get("is_title_manually_edited", (existing.is_title_manually_edited == 1))
    tags = update_data.get("tags")
    properties = update_data.get("properties")
    
    # 同步更新数据库：仅更新用户直接修改的核心字段
    from backend.database import with_db_retry
    @with_db_retry(max_retries=3)
    def do_quick_update():
        return update_note(
            db,
            note_id,
            title=title,
            content=content,
            summary=existing.summary,
            tags=tags,
            icon=icon,
            type=type,
            parent_id=parent_id,
            is_title_manually_edited=is_title_manually_edited,
            properties=properties,
            background_paper=background_paper,
            sort_key=sort_key,
            stickers=stickers,
            sticky_notes=sticky_notes,
        )
    
    note = do_quick_update()

    # v0.22.0 · 旁路打快照(去重+去抖)
    try:
        _ensure_revision_note_row(db, note)
        revision_service.maybe_snapshot(
            db,
            note_id=note_id,
            title=title or "",
            content=content or "",
            source="auto",
        )
    except Exception as snapshot_error:
        # 快照失败不阻塞主流程
        print(f"[revision] maybe_snapshot failed for note {note_id}: {snapshot_error}")

    # 1.5 更新手动链接
    manual_link_ids = extract_manual_links(content or "")
    # 即使为空也更新，以防用户删除了所有链接
    had_manual_links = any(link.link_type == "manual" for link in existing.links_from)
    if manual_link_ids or had_manual_links:
        replace_note_links(db, note_id, [(tid, 1.0) for tid in manual_link_ids], link_type="manual")

    # 2. 异步执行耗时的 AI 处理 (摘要、向量化、自动链接)
    spawn_note_indexing(
        note.id,
        title,
        content or "",
        tags=tags,
        icon=icon,
        type=type,
        parent_id=parent_id,
        is_title_manually_edited=is_title_manually_edited,
    )
    
    return note_to_response(note)

@router.patch("/notes/{note_id}/tags", response_model=NoteResponse)
def update_note_tags_api(note_id: int, tags: list[str], db: Session = Depends(get_db)) -> NoteResponse:
    note = update_note(db, note_id, tags=tags)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)

@router.patch("/notes/{note_id}/move", response_model=NoteResponse)
def move_note_api(note_id: int, payload: NoteMovePayload, db: Session = Depends(get_db)) -> NoteResponse:
    target_notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
    note = move_note(db, note_id, target_notebook_id, payload.position, payload.parent_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)

@router.post("/notes/bulk-move")
def bulk_move_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict:
    notebook_id = payload.notebook_id or get_or_create_default_notebook(db).id
    notes = bulk_move_notes(db, payload.note_ids, notebook_id, payload.position, payload.parent_id)
    return {"notes": [note_to_response(note).model_dump() for note in notes]}

@router.post("/notes/bulk-delete")
def bulk_delete_notes_api(payload: BulkNoteAction, db: Session = Depends(get_db)) -> dict:
    notes = bulk_soft_delete_notes(db, payload.note_ids)
    _delete_vector_chunks_for_notes([note.id for note in notes if not getattr(note, "is_folder", False)])
    return {"notes": [note_to_response(note).model_dump() for note in notes]}

@router.delete("/notes/{note_id}")
def delete_note_api(note_id: int, db: Session = Depends(get_db)) -> dict:
    note = soft_delete_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if not getattr(note, "is_folder", False):
        _delete_vector_chunks_for_notes([note_id])
    return {"status": "ok"}

@router.post("/notes/{note_id}/restore", response_model=NoteResponse)
def restore_note_api(note_id: int, db: Session = Depends(get_db)) -> NoteResponse:
    note = restore_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_response(note)

@router.delete("/notes/{note_id}/purge")
def delete_note_purge_api(note_id: int, db: Session = Depends(get_db)) -> dict:
    target = next((note for note in list_trashed_notes(db) if note.id == note_id), None)
    if not purge_note(db, note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    if target is None or not getattr(target, "is_folder", False):
        _delete_vector_chunks_for_notes([note_id])
    return {"status": "ok"}

@router.delete("/trash/purge")
def purge_trash_api(db: Session = Depends(get_db)) -> dict:
    trashed_note_ids = [note.id for note in list_trashed_notes(db) if not note.is_folder]
    if not purge_trash(db):
        raise HTTPException(status_code=500, detail="Failed to purge trash")
    _delete_vector_chunks_for_notes(trashed_note_ids)
    return {"status": "ok"}


# ============================================================
# 📜 v0.22.0 · 笔记版本快照 (revisions)
# ============================================================

@router.get("/system/revision-settings")
def get_revision_settings_api() -> dict:
    """读取版本快照策略(去抖秒数 / 保留条数)."""
    return revision_service.get_settings()


@router.put("/system/revision-settings")
def update_revision_settings_api(payload: dict) -> dict:
    """更新版本快照策略. 参数: {debounce_seconds?: int, max_keep?: int}"""
    allowed = {k: v for k, v in (payload or {}).items() if k in ("debounce_seconds", "max_keep")}
    return revision_service.update_settings(allowed)


@router.get("/notes/{note_id}/revisions")
def list_note_revisions_api(note_id: int, db: Session = Depends(get_db)) -> list[dict]:
    """列出某笔记的所有版本快照(元信息),不含正文.

    v0.22.0-a hotfix8 · 笔记不存在(如回滚后竞态/vault 扫描未命中)时返回空列表,
    不再 404,避免 Chrome DevTools 红字打印且前端显示 raw JSON 错误.

    v0.23.4 hotfix (idle-collapse) · 回退后 vault 扫描瞬间 get_note 可能抖回
    None, 这里改为: 即使 get_note 找不到笔记, 只要 note_revisions 表还有本
    note_id 的行, 就把快照列出来, 避免历史抽屉被"扫描抖动"清空.
    """
    rows = revision_service.list_revisions(db, note_id)
    return [
        {
            "id": r.id,
            "note_id": r.note_id,
            "created_at": _revision_timestamp_iso(r.created_at),
            "content_hash": r.content_hash,
            "title_snapshot": r.title_snapshot,
            "byte_size": r.byte_size,
            "source": r.source,
        }
        for r in rows
    ]


@router.get("/notes/{note_id}/revisions/{revision_id}")
def get_note_revision_api(note_id: int, revision_id: int, db: Session = Depends(get_db)) -> dict:
    """获取指定版本的完整内容.

    v0.22.0-a hotfix6 · 版本被 prune 是正常业务流,不再返回 404
    (会被 Chrome DevTools 红字打印且无法拦截),改为 200 + {"missing": true},
    由前端静默刷新列表.

    v0.23.4 hotfix (idle-collapse v2) · 回退过程中 vault 扫描可能瞬时返回
    get_note=None, 旧代码直接 404 → 前端捕获异常后重新拉 list → list 又去
    拉 detail → 再 404 → 循环刷新. 改成只要 revision 行在 DB 里就返回内容,
    不再用 vault 状态做 404 门槛.
    """
    result = revision_service.get_revision(db, note_id, revision_id)
    if result is None:
        # 只有"笔记不存在 且 快照行也不存在"才算真正 missing
        return {
            "id": revision_id,
            "note_id": note_id,
            "created_at": None,
            "content_hash": "",
            "title_snapshot": "",
            "byte_size": 0,
            "source": "missing",
            "content": "",
            "missing": True,
        }
    content, rev = result
    return {
        "id": rev.id,
        "note_id": rev.note_id,
        "created_at": _revision_timestamp_iso(rev.created_at),
        "content_hash": rev.content_hash,
        "title_snapshot": rev.title_snapshot,
        "byte_size": rev.byte_size,
        "source": rev.source,
        "content": content,
        "missing": False,
    }


@router.post("/notes/{note_id}/revisions/{revision_id}/restore")
def restore_note_revision_api(note_id: int, revision_id: int, db: Session = Depends(get_db)):
    """回滚到指定版本:
      1. 先为当前版本打一条 restore-point 兜底
      2. 用目标版本内容覆盖 note.content

    v0.22.0-a hotfix7 · 目标版本若已被 prune 删除,返回 200 + {"missing": true},
    由前端提示"该版本已失效,请刷新列表",避免 Chrome DevTools 红字 404.

    v0.23.4 hotfix (idle-collapse) · 在关键步骤前后打印快照行数, 方便回退后
    "历史变空"时定位是: (a) DB 真被清了 / (b) vault 扫描抖动 / (c) 前端未触发刷新.
    """
    existing = get_note(db, note_id)
    if not existing:
        # v0.23.4 idle-collapse v2: vault 扫描瞬时抖动不应阻断 restore.
        # 只要有任意快照行, 再等 3ms 重试一次; 依旧 None 才真 404
        from backend.models.db_models import NoteRevision as _NR0
        if db.query(_NR0).filter(_NR0.note_id == note_id).count() > 0:
            import time as _time
            _time.sleep(0.003)
            existing = get_note(db, note_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Note not found")

    from backend.models.db_models import NoteRevision as _NR
    rows_before = db.query(_NR).filter(_NR.note_id == note_id).count()
    print(f"[revision][restore] before: note={note_id} revisions={rows_before}")

    _ensure_revision_note_row(db, existing)
    result = revision_service.restore_revision(
        db,
        note_id=note_id,
        revision_id=revision_id,
        current_title=existing.title or "",
        current_content=existing.content or "",
    )
    if result is None:
        # 版本已失效(被 prune 或其它会话删除),前端会捕获 missing 并刷新列表
        return {"missing": True, "detail": "Revision not found"}
    target_content, _rev = result

    # 覆盖写回
    from backend.database import with_db_retry

    @with_db_retry(max_retries=3)
    def do_restore():
        return update_note(
            db,
            note_id,
            title=existing.title,
            content=target_content,
            summary=existing.summary,
        )

    note = do_restore()
    if not note:
        raise HTTPException(status_code=500, detail="Failed to restore revision")

    # 再为"新当前版本"打一条 manual 快照, 方便后续继续版本回溯
    try:
        _ensure_revision_note_row(db, note)
        revision_service.maybe_snapshot(
            db,
            note_id=note_id,
            title=note.title or "",
            content=note.content or "",
            source="restore",
            protected_revision_ids={_rev.id},
        )
    except Exception as err:
        print(f"[revision] post-restore snapshot failed for note {note_id}: {err}")

    rows_after = db.query(_NR).filter(_NR.note_id == note_id).count()
    print(f"[revision][restore] after:  note={note_id} revisions={rows_after}")

    return note_to_response(note)


# v0.22.0-a hotfix2 · 独立的快照触发接口
# 前端在 Electron IPC 保存成功后调用,解决 IPC 绕过 FastAPI 路由导致快照不生成的问题
@router.post("/notes/{note_id}/snapshot")
def capture_note_snapshot_api(
    note_id: int,
    payload: dict | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """主动触发一次快照(去重+去抖).
    Body: {"source": "auto" | "save"}  — 默认 auto
    返回 {"status": "ok", "snapshot_id": int | null}
    """
    source = "auto"
    snapshot_title = ""
    snapshot_content = ""
    has_payload_content = False
    existing = get_note(db, note_id)
    if not existing or getattr(existing, "deleted_at", None) is not None:
        return {
            "status": "skipped",
            "snapshot_id": None,
            "skipped": True,
            "detail": "Note not found",
        }
    if isinstance(payload, dict):
        raw_source = payload.get("source")
        if raw_source in ("auto", "save", "manual", "pre-save", "stable"):
            source = "save" if raw_source == "manual" else raw_source
        raw_title = payload.get("title")
        raw_content = payload.get("content")
        if isinstance(raw_title, str):
            snapshot_title = raw_title
        if isinstance(raw_content, str):
            snapshot_content = raw_content
            has_payload_content = True

    if not has_payload_content:
        snapshot_title = existing.title or ""
        snapshot_content = existing.content or ""

    try:
        _ensure_revision_note_row(db, existing)
        rev = revision_service.maybe_snapshot(
            db,
            note_id=note_id,
            title=snapshot_title,
            content=snapshot_content,
            source=source,
        )
    except Exception as err:
        print(f"[revision] snapshot API failed for note {note_id}: {err}")
        return {"status": "error", "snapshot_id": None, "detail": str(err)}

    return {
        "status": "ok",
        "snapshot_id": rev.id if rev else None,
        "skipped": rev is None,
    }


# ============================================================
# 🎵 音乐库接口 (整合自 main.py)
# ============================================================

@router.get("/media/music-library")
async def get_music_library():
    music_dir = Path(settings.music_path)
    if not music_dir.exists():
        music_dir.mkdir(parents=True, exist_ok=True)
    
    tracks = []
    # 格式支持放宽
    extensions = {'.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac'}
    img_extensions = {'.jpg', '.png', '.jpeg', '.webp'}
    
    # Sort for deterministic output
    files = sorted(list(music_dir.iterdir()))
    for file in files:
        if file.suffix.lower() in extensions:
            title = file.stem
            cover = None
            # Match songA.jpg or songA.png for songA.mp3
            for img_ext in img_extensions:
                img_file = music_dir / f"{title}{img_ext}"
                if img_file.exists():
                    cover = f"/api/media/static/music/{img_file.name}"
                    break
            
            tracks.append({
                "url": f"/api/media/static/music/{file.name}",
                "title": title,
                "artist": "本地音频",
                "cover": cover,
                "source": "local"
            })
        elif file.suffix.lower() == '.json':
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # 支持 JSON 解析库，扫描 .json 文件
                    if "url" in data and "title" in data:
                        tracks.append({
                            "url": data["url"],
                            "title": data["title"],
                            "artist": data.get("artist", "网络直链"),
                            "cover": data.get("cover"),
                            "source": "network"
                        })
            except Exception:
                pass
    return tracks


@router.post("/media/music-link")
async def save_music_link(payload: dict):
    """保存直链保存接口"""
    title = payload.get("title")
    url = payload.get("url")
    cover = payload.get("cover")
    if not title or not url:
        raise HTTPException(status_code=400, detail="Title and URL are required")
    
    music_dir = Path(settings.music_path)
    music_dir.mkdir(parents=True, exist_ok=True)
    
    json_path = safe_named_file(music_dir, f"{title}.json", detail="Invalid title")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "title": title, 
            "url": url, 
            "cover": cover, 
            "artist": "网络直链",
            "source": "network"
        }, f, ensure_ascii=False, indent=2)
    
    return {"status": "success", "path": str(json_path)}


@router.post("/media/music-upload")
def upload_music(file: UploadFile = File(...), cover: UploadFile = File(None)):
    """上传接口扩展"""
    music_dir = Path(settings.music_path)
    music_dir.mkdir(parents=True, exist_ok=True)
    
    # 📝 修复：安全处理文件名，防止目录遍历，并确保文件写入
    safe_filename = Path(file.filename).name if file.filename else f"upload_{uuid.uuid4().hex}"
    audio_path = safe_named_file(music_dir, safe_filename)
    
    try:
        with open(audio_path, "wb") as f:
            f.write(read_upload_file_sync_limited(file))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save audio file: {str(e)}")
        
    # Save cover if provided
    cover_url = None
    if cover and cover.filename:
        safe_cover_name = Path(cover.filename).name
        cover_path = safe_named_file(music_dir, safe_cover_name)
        try:
            with open(cover_path, "wb") as f:
                f.write(read_upload_file_sync_limited(cover))
            cover_url = f"/api/media/static/music/{safe_cover_name}"
        except Exception as e:
            print(f"[!] Error saving cover: {str(e)}")
    
    return {
        "status": "success",
        "url": f"/api/media/static/music/{safe_filename}",
        "cover": cover_url
    }

# ============================================================
# 🎵 BGM 播放器接口
# ============================================================

@router.get("/bgm/list", response_model=list[str])
def list_bgm():
    """获取 BGM 文件列表"""
    bgm_path = Path(settings.data_root) / "bgm"
    if not bgm_path.exists():
        bgm_path.mkdir(parents=True, exist_ok=True)
    
    files = []
    for ext in ["*.mp3", "*.wav", "*.ogg"]:
        files.extend([f.name for f in bgm_path.glob(ext)])
    return sorted(files)

@router.get("/bgm/stream/{filename}")
def stream_bgm(filename: str):
    """流式返回 BGM 文件"""
    bgm_path = safe_named_file(Path(settings.data_root) / "bgm", filename)
    if not bgm_path.exists():
        raise HTTPException(status_code=404, detail="BGM file not found")

    # Use FileResponse to avoid tiny line-based chunks produced by iterating a binary file object.
    return FileResponse(path=str(bgm_path), media_type="audio/mpeg", filename=filename)

# ============================================================
# 🎨 贴纸系统接口
# ============================================================

@router.get("/stickers/list", response_model=list[dict])
def list_stickers():
    """获取贴纸资源列表"""
    stickers_path = Path(settings.stickers_path)
    if not stickers_path.exists():
        stickers_path.mkdir(parents=True, exist_ok=True)
        # 尝试从 nova_repo/data/stickers 初始化 (如果是开发环境且 path 不对)
        dev_data_path = PROJECT_DIR / "data" / "stickers"
        if dev_data_path.exists() and dev_data_path != stickers_path:
            for f in dev_data_path.glob("*.*"):
                if f.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]:
                    shutil.copy2(f, stickers_path / f.name)
    
    files = []
    # 支持常见的图片格式
    extensions = ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.svg"]
    for ext in extensions:
        for f in stickers_path.glob(ext):
            # 排除生成的缩略图文件本身被列出
            if f.name.endswith(".thumb.png"):
                continue
                
            url = f"/api/stickers/files/{f.name}"
            thumb_url = url
            
            # 动图特殊处理
            if f.suffix.lower() in [".gif", ".webp"]:
                thumb_name = get_or_create_thumbnail(f)
                if thumb_name:
                    thumb_url = f"/api/stickers/files/{thumb_name}"
            
            files.append({
                "name": f.name,
                "url": url,
                "thumb_url": thumb_url
            })
    return sorted(files, key=lambda x: x["name"])

@router.post("/stickers/upload")
def upload_sticker(file: UploadFile = File(...)):
    """上传新贴纸"""
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]:
            raise HTTPException(status_code=400, detail="Unsupported file type")
            
        unique_name = f"{uuid.uuid4()}{ext}"
        save_path = safe_named_file(settings.stickers_path, unique_name)
        
        with open(save_path, "wb") as f:
            f.write(read_upload_file_sync_limited(file))
            
        return {
            "name": unique_name,
            "url": f"/api/stickers/files/{unique_name}",
            "original_name": file.filename
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Sticker upload failed: {str(e)}")

@router.get("/stickers/files/{filename}")
def get_sticker_file(filename: str):
    """获取贴纸文件内容"""
    file_path = safe_named_file(settings.stickers_path, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Sticker not found")

    import mimetypes
    mime_type, _ = mimetypes.guess_type(filename)

    # Use FileResponse to avoid tiny line-based chunks produced by iterating a binary file object.
    return FileResponse(path=str(file_path), media_type=mime_type or "image/png", filename=filename)

@router.delete("/stickers/files/{filename}")
def delete_sticker_file(filename: str):
    """物理删除贴纸文件"""
    file_path = safe_named_file(settings.stickers_path, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Sticker not found")
    
    try:
        os.remove(file_path)
        return {"status": "ok", "message": f"Sticker {filename} deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete sticker: {str(e)}")

@router.get("/tasks", response_model=list[TaskResponse])
def get_tasks(db: Session = Depends(get_db)) -> list[TaskResponse]:
    return [TaskResponse.model_validate(task) for task in list_tasks(db)]

@router.post("/tasks", response_model=TaskResponse)
def create_task_api(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(create_task(db, payload.title, payload.status, payload.priority, payload.task_type, payload.deadline))

@router.post("/tasks/clear-completed")
def clear_completed_tasks_api(db: Session = Depends(get_db)) -> dict:
    count = clear_completed_tasks(db)
    return {"status": "ok", "cleared_count": count}

# ============================================================
# 😄 表情包系统接口
# ============================================================

@router.post("/emoticons/upload")
def upload_emoticon(file: UploadFile = File(...)):
    """上传新表情"""
    try:
        emoticons_path = Path(settings.data_root) / "emoticons"
        if not emoticons_path.exists():
            emoticons_path.mkdir(parents=True, exist_ok=True)

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]:
            raise HTTPException(status_code=400, detail="Unsupported file type")
            
        unique_name = f"{uuid.uuid4()}{ext}"
        save_path = safe_named_file(emoticons_path, unique_name)
        
        with open(save_path, "wb") as f:
            f.write(read_upload_file_sync_limited(file))
            
        return {
            "name": unique_name,
            "url": f"/api/emoticons/static/files/{unique_name}",
            "original_name": file.filename
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Emoticon upload failed: {str(e)}")

@router.get("/emoticons/files/{filename}")
def get_emoticon_file(filename: str):
    """获取表情文件内容"""
    emoticons_path = Path(settings.data_root) / "emoticons"
    file_path = safe_named_file(emoticons_path, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Emoticon not found")

    import mimetypes
    mime_type, _ = mimetypes.guess_type(filename)

    # Use FileResponse to avoid tiny line-based chunks produced by iterating a binary file object.
    return FileResponse(path=str(file_path), media_type=mime_type or "image/png", filename=filename)

@router.delete("/emoticons/files/{filename}")
def delete_emoticon_file(filename: str):
    """物理删除表情文件"""
    emoticons_path = Path(settings.data_root) / "emoticons"
    file_path = safe_named_file(emoticons_path, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Emoticon not found")
    
    try:
        os.remove(file_path)
        return {"status": "ok", "message": f"Emoticon {filename} deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete emoticon: {str(e)}")

@router.patch("/tasks/{task_id:int}", response_model=TaskResponse)
def update_task_api(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)) -> TaskResponse:
    task = update_task(db, task_id, title=payload.title, status=payload.status, priority=payload.priority, task_type=payload.task_type, deadline=payload.deadline)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse.model_validate(task)

@router.delete("/tasks/{task_id:int}")
def delete_task_api(task_id: int, db: Session = Depends(get_db)) -> dict:
    if not delete_task(db, task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "ok"}

@router.post("/agent")
async def agent_api(payload: AgentRequest, db: Session = Depends(get_db)) -> dict:
    response = await run_agent(db, payload.goal, ai_client)
    return response.model_dump()

@router.get("/model-config")
def get_model_config_api(db: Session = Depends(get_db)) -> dict:
    config = get_or_create_model_config(db)
    return {
        "provider": config.provider,
        "api_key_masked": mask_api_key(config.api_key),
        "base_url": config.base_url,
        "model_name": config.model_name,
    }

@router.post("/model-config")
def update_model_config_api(payload: ModelConfigPayload, db: Session = Depends(get_db)) -> dict:
    config = update_model_config(db, payload.provider, payload.api_key, payload.base_url, payload.model_name)
    return {
        "provider": config.provider,
        "api_key_masked": mask_api_key(config.api_key),
        "base_url": config.base_url,
        "model_name": config.model_name,
    }

# ============================================================
# 🖥️ 系统管理接口 (Windows 窗口化增强)
# ============================================================

@router.get("/system/logs")
async def get_system_logs():
    """获取实时日志 Buffer"""
    return {"logs": log_buffer.get_logs()}


@router.get("/system/vault-health")
async def get_vault_health():
    return scan_vault_health(settings.vault_path)


# ============================================================
# 📦 v0.22.0 · 一键导出全部数据 (single-user backup)
# ============================================================

@router.post("/system/export-all")
async def export_all_data(payload: dict | None = None):
    """打包导出 Nova 的全部本地数据为一个 zip 文件.

    包含:
      - manifest.json         · 元信息(版本, 导出时间, 各区尺寸)
      - nova.db               · SQLite 主库 (WAL checkpoint 后)
      - vault/**              · 笔记 markdown 物理文件
      - music/** stickers/** emoticons/**  · 用户上传的多媒体资源
      - widgets-kv.json       · 前端 LocalStorage dump (来自调用方)

    请求体 (可选):
      { "localstorage": { ...前端 localStorage 的键值 JSON... } }
    """
    import zipfile
    import tempfile
    import json as _json
    from datetime import datetime as _dt

    localstorage_dump: dict = {}
    if isinstance(payload, dict):
        ls = payload.get("localstorage")
        if isinstance(ls, dict):
            localstorage_dump = ls

    data_root: Path = settings.data_root
    db_file = data_root / "second_brain.db"

    # 1. WAL checkpoint + integrity_check
    integrity = "unknown"
    checkpoint_ok = False
    try:
        with engine.connect() as conn:
            try:
                conn.exec_driver_sql("PRAGMA wal_checkpoint(FULL)")
                checkpoint_ok = True
            except Exception as e:
                print(f"[export-all] wal_checkpoint failed: {e}")
            try:
                row = conn.exec_driver_sql("PRAGMA integrity_check").fetchone()
                if row:
                    integrity = str(row[0])
            except Exception as e:
                print(f"[export-all] integrity_check failed: {e}")
    except Exception as e:
        print(f"[export-all] sqlite pragma phase failed: {e}")

    # 2. 组装 zip 到临时文件
    tmp = tempfile.NamedTemporaryFile(prefix="nova-export-", suffix=".zip", delete=False)
    tmp.close()
    tmp_path = Path(tmp.name)

    def _add_dir(zf: zipfile.ZipFile, root: Path, arcprefix: str) -> int:
        if not root.exists() or not root.is_dir():
            return 0
        count = 0
        for p in root.rglob("*"):
            if p.is_file():
                try:
                    zf.write(p, arcname=f"{arcprefix}/{p.relative_to(root).as_posix()}")
                    count += 1
                except Exception as e:
                    print(f"[export-all] skip {p}: {e}")
        return count

    file_counts: dict[str, int] = {}
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            # manifest 先占位, 最后再写
            if db_file.exists():
                zf.write(db_file, arcname="nova.db")
                file_counts["nova.db"] = 1

            file_counts["vault"] = _add_dir(zf, Path(settings.vault_path), "vault")
            file_counts["music"] = _add_dir(zf, Path(settings.music_path), "music")
            file_counts["stickers"] = _add_dir(zf, Path(settings.stickers_path), "stickers")
            file_counts["emoticons"] = _add_dir(zf, Path(settings.emoticons_path), "emoticons")

            # chroma 向量库可选(体积较大, 但缺失可重建, 这里也一并带上以便完全还原)
            chroma_dir = Path(settings.chroma_path)
            file_counts["chroma_store"] = _add_dir(zf, chroma_dir, "chroma_store")

            # LocalStorage dump
            zf.writestr(
                "widgets-kv.json",
                _json.dumps(localstorage_dump, ensure_ascii=False, indent=2),
            )

            # manifest
            manifest = {
                "schema": "nova-export/v1",
                "exported_at": _dt.utcnow().isoformat() + "Z",
                "integrity_check": integrity,
                "wal_checkpoint": checkpoint_ok,
                "file_counts": file_counts,
                "data_root": str(data_root),
            }
            zf.writestr(
                "manifest.json",
                _json.dumps(manifest, ensure_ascii=False, indent=2),
            )
    except Exception as e:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"export failed: {e}")

    # 3. 流式返回并在完成后清理临时文件
    def _iter_and_cleanup():
        try:
            with open(tmp_path, "rb") as f:
                while True:
                    chunk = f.read(1024 * 512)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

    filename = f"nova-export-{_dt.utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        _iter_and_cleanup(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Nova-Integrity-Check": integrity,
        },
    )


@router.post("/system/switch-data-path")
async def switch_data_path(payload: dict):
    """切换数据存储路径。如果目标路径不存在数据库，则迁移；如果已存在，则直接切换。"""
    new_path_str = payload.get("data_path")
    if not new_path_str:
        raise HTTPException(status_code=400, detail="Missing data_path")
    
    new_path = Path(new_path_str).resolve()
    old_path = settings.data_root.resolve()
    
    if new_path == old_path:
        return {"status": "ok", "message": "Path is same"}

    try:
        # 1. 确保新路径父目录存在
        new_path.mkdir(parents=True, exist_ok=True)
        
        # 2. 检查目标路径是否已存在数据库
        target_db = new_path / "second_brain.db"
        if not target_db.exists():
            # 目标路径没有数据库，执行“迁移”逻辑：将当前 data_root 的所有文件剪切/移动到新路径
            if old_path.exists():
                print(f"[*] Moving data from {old_path} to {new_path}...")
                # 遍历旧目录下的所有文件和文件夹
                for item in old_path.iterdir():
                    dest = new_path / item.name
                    # 如果目标已存在，先尝试删除（通常新目录下不会有同名文件）
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    
                    # 尝试移动
                    try:
                        shutil.move(str(item), str(dest))
                    except Exception:
                        if item.is_dir():
                            shutil.copytree(item, dest, dirs_exist_ok=True)
                            shutil.rmtree(item)
                        else:
                            shutil.copy2(item, dest)
                            item.unlink()
        else:
            # 目标路径已存在数据库，直接切换指向新路径（相当于自动读取新路径的旧数据）
            print(f"[*] Target database exists at {target_db}, switching engine to use it.")

        # 3. 更新 data_config.json
        config_path = get_custom_config_path()
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump({"data_path": str(new_path)}, f, indent=4)
            
        return {"status": "ok", "message": "路径切换成功，请重启软件生效"}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to switch data path: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to switch data path: {str(e)}")

@router.get("/system/version")
async def get_system_version():
    """读取 VERSION.txt 或 metadata.json 获取详细版本信息"""
    import sys
    from backend.config import resource_root
    
    res_root = resource_root()
    metadata_file = res_root / "metadata.json"
    version_file = res_root / "VERSION.txt"
    
    info = {
        "version": "unknown",
        "git_commit": "unknown",
        "build_time": "unknown",
        "executable": sys.executable,
    }
    
    try:
        if metadata_file.exists():
            with open(metadata_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                info.update(data)
        elif version_file.exists():
            info["version"] = version_file.read_text(encoding="utf-8").strip()
    except Exception as e:
        print(f"[!] Error reading version info: {str(e)}")
        
    return info

@router.post("/system/update")
async def system_update(force: bool = False):
    """检查更新或执行 git pull origin main"""
    import shutil as _shutil
    import sys as _sys
    import os as _os
    
    try:
        # 1. 确定正确的 git 仓库根目录
        from backend.config import runtime_root
        if getattr(_sys, "frozen", False):
            repo_dir = str(runtime_root())
        else:
            repo_dir = str(PROJECT_DIR)
        
        # 2. 检查 git 是否可用 (增强检测：主动寻找安装路径)
        git_cmd = _shutil.which("git")
        if not git_cmd:
            # 常见安装路径探测 (Windows)
            possible_git_paths = [
                "C:\\Program Files\\Git\\bin\\git.exe",
                "C:\\Program Files\\Git\\cmd\\git.exe",
                "C:\\Program Files (x86)\\Git\\bin\\git.exe",
                "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
                _os.path.join(_os.environ.get("LOCALAPPDATA", ""), "Programs", "Git", "cmd", "git.exe")
            ]
            for path in possible_git_paths:
                if _os.path.exists(path):
                    git_cmd = path
                    break
        
        if not git_cmd:
            return {"status": "error", "output": "❌ 系统未找到 git 命令。\n请确保已安装 Git 并在终端中可访问。\n下载地址: https://git-scm.com/download/win"}
        
        # 3. 检查 .git 目录是否存在
        from pathlib import Path as _Path
        if not (_Path(repo_dir) / ".git").exists():
            return {"status": "error", "output": f"❌ 未找到 Git 仓库（.git 目录不存在）\n查找路径: {repo_dir}\n\n请确认您是从源码目录运行，而非只复制了 .exe 文件。"}
        
        print(f"[*] Using git at: {git_cmd}")
        print(f"[*] Git repo dir: {repo_dir}")
        print("[*] Checking for updates...")

        branch_res = subprocess.run(
            [git_cmd, "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
        )
        branch = (branch_res.stdout or "").strip()
        if not branch or branch == "HEAD":
            branch = _os.environ.get("NOVA_RELEASE_CHANNEL", "main").strip() or "main"
        
        # 4. 先执行 fetch 获取远程状态 (设置超时)
        try:
            subprocess.run([git_cmd, "fetch", "origin", branch], cwd=repo_dir, capture_output=True, timeout=15)
        except subprocess.TimeoutExpired:
            return {"status": "error", "output": "❌ git fetch 超时 (15s)，请检查网络连接后再重试。"}
        
        # 5. 比较本地和远程版本
        local_res = subprocess.run([git_cmd, "rev-parse", "HEAD"], cwd=repo_dir, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        remote_ref = f"origin/{branch}"
        remote_res = subprocess.run([git_cmd, "rev-parse", remote_ref], cwd=repo_dir, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        
        local = local_res.stdout.strip()
        remote = remote_res.stdout.strip()
        
        if not local or not remote:
            return {"status": "error", "output": f"❌ 获取版本号失败。请确保当前分支是 main，且网络通畅。\nLocal: {local[:7]}\nRemote: {remote[:7]}"}

        if local == remote and not force:
            return {"status": "up-to-date", "output": f"🎉 已是最新版本！无需更新。\n当前版本: {local[:7]}"}

        if not force:
            return {"status": "pending", "output": f"🔍 发现新版本！\n当前版本: {local[:7]}\n最新版本: {remote[:7]}\n\n请点击「确认更新」下载并安装最新代码。"}

        # 6. 执行更新
        process = subprocess.run(
            [git_cmd, "pull", "origin", branch],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore'
        )
        output = process.stdout + "\n" + process.stderr
        print(output)
        return {"status": "ok", "output": f"✅ 更新完成！\n{output}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/system/restart")
async def system_restart():
    """执行 fast_update.bat 脚本"""
    import sys as _sys
    try:
        from backend.config import runtime_root
        if getattr(_sys, "frozen", False):
            repo_dir = runtime_root()
        else:
            repo_dir = PROJECT_DIR
            
        bat_path = repo_dir / "fast_update.bat"
        if not bat_path.exists():
            raise HTTPException(status_code=404, detail=f"fast_update.bat not found at {bat_path}")
        
        print(f"[*] Restarting application via {bat_path}...")
        # 启动脚本，不阻塞当前进程
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
            subprocess.Popen(["cmd.exe", "/c", str(bat_path)], cwd=str(repo_dir), creationflags=creationflags)
        else:
            subprocess.Popen([str(bat_path)], cwd=str(repo_dir))
        return {"status": "ok", "message": "Restarting..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/system/open-file")
async def open_file(payload: dict):
    """通过系统默认程序打开文件"""
    file_path_str = payload.get("path")
    if not file_path_str:
        raise HTTPException(status_code=400, detail="Missing file path")
    
    # 允许打开本地绝对路径或相对于上传目录的路径
    p = Path(file_path_str)
    if not p.is_absolute():
        p = safe_child_path(settings.uploads_path, file_path_str, detail="File path is outside allowed roots")
    else:
        requested = p.resolve()
        allowed_roots = (
            Path(settings.vault_path).resolve(),
            Path(settings.uploads_path).resolve(),
            Path(settings.music_path).resolve(),
        )
        if not any(requested == root or requested.is_relative_to(root) for root in allowed_roots):
            raise HTTPException(status_code=403, detail="File path is outside allowed roots")
        p = requested
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {p}")

    try:
        import platform
        system = platform.system()
        if system == "Windows":
            os.startfile(str(p))
        elif system == "Darwin":  # macOS
            subprocess.run(["open", str(p)])
        else:  # Linux
            subprocess.run(["xdg-open", str(p)])
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file: {str(e)}")

@router.post("/system/import-data")
async def import_data(payload: dict):
    """从源目录导入数据并覆盖当前数据。"""
    source_path_str = payload.get("source_path")
    if not source_path_str:
        raise HTTPException(status_code=400, detail="Missing source_path")
    
    source_path = Path(source_path_str).resolve()
    data_root = settings.data_root.resolve()
    
    # 1. 验证路径
    if not source_path.exists() or not source_path.is_dir():
        raise HTTPException(status_code=400, detail="Invalid source path")
    
    # 2. 检查源目录是否包含数据库文件
    if not (source_path / "second_brain.db").exists():
        raise HTTPException(status_code=400, detail="second_brain.db not found in source path")
    
    # 3. 检查源目录是否等于目标目录
    if source_path == data_root:
        raise HTTPException(status_code=400, detail="选择的导入目录与当前数据目录相同，无需导入")

    if not (source_path / "vault").exists():
        raise HTTPException(status_code=400, detail="vault not found in source path")

    items_to_copy = ["second_brain.db", "chroma_store", "vault"]
    import_id = uuid.uuid4().hex
    staging_dir = data_root.parent / f".import-staging-{import_id}"
    backup_dir = data_root.parent / f".import-backup-{import_id}"
    backed_up = False

    def copy_item(src_item: Path, dest_item: Path):
        if src_item.is_dir():
            shutil.copytree(src_item, dest_item)
        else:
            dest_item.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_item, dest_item)

    def remove_item(path: Path):
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()

    def restore_backup():
        if not backed_up or not backup_dir.exists():
            return
        for item_name in items_to_copy:
            dest_item = data_root / item_name
            backup_item = backup_dir / item_name
            remove_item(dest_item)
            if backup_item.exists():
                shutil.move(str(backup_item), str(dest_item))

    try:
        print(f"[*] Importing data from {source_path} to {data_root}...")
        staging_dir.mkdir(parents=True, exist_ok=False)
        data_root.mkdir(parents=True, exist_ok=True)

        # 先复制到 staging，避免复制到一半时破坏当前数据目录。
        for item_name in items_to_copy:
            src_item = source_path / item_name
            if src_item.exists():
                copy_item(src_item, staging_dir / item_name)

        import sqlite3
        conn = sqlite3.connect(staging_dir / "second_brain.db")
        try:
            integrity = conn.execute("PRAGMA integrity_check").fetchone()
        finally:
            conn.close()
        if not integrity or integrity[0] != "ok":
            raise RuntimeError("Imported database failed integrity_check")

        # 关闭所有数据库连接以便文件操作；之后才开始替换当前数据。
        engine.dispose()
        backup_dir.mkdir(parents=True, exist_ok=False)
        for item_name in items_to_copy:
            dest_item = data_root / item_name
            if dest_item.exists():
                shutil.move(str(dest_item), str(backup_dir / item_name))
        backed_up = True

        for item_name in items_to_copy:
            staged_item = staging_dir / item_name
            if staged_item.exists():
                shutil.move(str(staged_item), str(data_root / item_name))

        shutil.rmtree(staging_dir, ignore_errors=True)
        shutil.rmtree(backup_dir, ignore_errors=True)
        return {"status": "ok", "message": "数据导入成功，请重启软件以加载新数据"}
    except Exception as e:
        import logging
        try:
            restore_backup()
        except Exception as restore_error:
            logging.getLogger(__name__).error(f"Failed to restore import backup: {str(restore_error)}")
        shutil.rmtree(staging_dir, ignore_errors=True)
        shutil.rmtree(backup_dir, ignore_errors=True)
        logging.getLogger(__name__).error(f"Failed to import data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import data: {str(e)}")


# ============================================================
# 🤖 AI 设置相关接口
# ============================================================

@router.post("/ai/toggle-plugin")
async def toggle_ai_plugin(payload: dict, background_tasks: BackgroundTasks):
    """切换 AI 插件启用状态或更新配置 (集成预置模型，实现瞬间就绪)"""
    global ai_enabled, ai_mode
    enabled = payload.get("enabled", ai_enabled)
    requested_mode = payload.get("ai_mode")
    next_ai_mode = normalize_ai_mode(requested_mode) if requested_mode is not None else ai_mode
    num_ctx = payload.get("num_ctx")
    
    ai_enabled = enabled
    ai_mode = next_ai_mode
    
    # 持久化到 ai_config.json
    config_path = Path(settings.data_root) / "ai_config.json"
    config = {"enabled": ai_enabled, "ai_mode": AI_MODE_REMOTE, "preferred_engine": "auto", "num_ctx": 8192}
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                old_config = json.load(f)
                config.update(old_config)
        except:
            pass
    
    config["enabled"] = ai_enabled
    config["ai_mode"] = ai_mode
    if num_ctx is not None:
        config["num_ctx"] = num_ctx
    
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    import logging
    logging.warning(f"[DEBUG] toggle_ai_plugin called. ai_enabled={ai_enabled}, ai_mode={ai_mode}, num_ctx={num_ctx}")
    
    if ai_enabled and ai_mode == AI_MODE_LOCAL:
        # 如果只是更新 num_ctx，我们也需要重新初始化模型以使配置生效
        if num_ctx is not None:
            await local_ai_manager.stop_ollama_server() # 重启以应用新配置

        logging.warning(f"[DEBUG] toggle_ai_plugin local_ai_manager id: {id(local_ai_manager)}")

        # 1) 确保集成的 Ollama 引擎已下载（ensure_ollama.py）仅限 Windows
        try:
            base_dir = Path(__file__).resolve().parent.parent.parent
            script_path = base_dir / "ensure_ollama.py"
            if script_path.exists() and sys.platform == "win32":
                print(f"[*] Dynamically running {script_path}...")
                process = await asyncio.create_subprocess_exec(sys.executable, str(script_path), cwd=str(base_dir))
                await process.wait()
        except Exception as e:
            print(f"[!] Failed to run ensure_ollama dynamically: {e}")

        # 2) 启动 Ollama（若未启动）
        try:
            await local_ai_manager.start_ollama_server()
        except Exception as e:
            print(f"[!] Failed to start Ollama server: {e}")

        # 3) 初始化本地 AI
        await local_ai_manager.initialize_model()
    else:
        # 物理级解耦：如果关闭 AI 或切换到远程，则彻底停止后端本地 AI 进程
        print("[*] Local AI disabled or remote mode selected. Killing local AI processes for physical decoupling...")
        await local_ai_manager.stop_ollama_server()
            
    return {"status": "success", "enabled": ai_enabled, "ai_mode": ai_mode, "num_ctx": config.get("num_ctx", 8192)}

@router.post("/ai/toggle")
async def ai_toggle_api(payload: dict, background_tasks: BackgroundTasks):
    """Alias for toggle-plugin to match Phase 2 requirements"""
    return await toggle_ai_plugin(payload, background_tasks)

@router.post("/ai/update-ollama")
async def update_ollama_api():
    """手动触发强制更新 Ollama 引擎"""
    try:
        base_dir = Path(__file__).resolve().parent.parent.parent
        script_path = base_dir / "ensure_ollama.py"
        if not script_path.exists():
            raise HTTPException(status_code=404, detail="Update script not found")
        
        # 强制更新逻辑：带上 --force 参数
        process = await asyncio.create_subprocess_exec(
            sys.executable, str(script_path), "--force",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(base_dir)
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            return {"status": "success", "output": stdout.decode()}
        else:
            return {"status": "error", "message": stderr.decode()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ai/plugin-status")
async def get_ai_plugin_status():
    """获取 AI 插件启用状态"""
    local_status = local_ai_manager.get_status()
    
    # 读取 ai_mode / num_ctx
    current_ai_mode = ai_mode
    num_ctx = 8192
    config_path = Path(settings.data_root) / "ai_config.json"
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
                current_ai_mode = normalize_ai_mode(config.get("ai_mode", ai_mode))
                num_ctx = config.get("num_ctx", 8192)
        except:
            pass
            
    return {
        "enabled": ai_enabled,
        "ai_mode": current_ai_mode,
        "num_ctx": num_ctx,
        "local_ai_ready": local_status["is_ready"],
        "local_ai_loading": local_status["is_loading"],
        "local_ai_error": local_status["error"]
    }

@router.get("/ai/hardware-check")
async def hardware_check():
    """检测系统硬件是否符合 AI 运行要求"""
    try:
        # 获取架构
        arch = platform.machine()
        # 获取核心数
        cpu_count = psutil.cpu_count(logical=False) or psutil.cpu_count()
        # 获取总内存 (GB)
        total_ram_gb = psutil.virtual_memory().total / (1024 ** 3)
        
        # 判定标准：内存 >= 4GB
        compatible = total_ram_gb >= 4
        
        status_msg = "完美兼容！" if compatible else "内存不足，可能运行缓慢。"
        details = f"架构: {arch}, 内存: {total_ram_gb:.1f}GB, 核心: {cpu_count}. 状态: {status_msg}"
        
        return {
            "compatible": compatible,
            "details": details
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Hardware check failed: {str(e)}")
        return {
            "compatible": False,
            "details": f"检测失败: {str(e)}"
        }


# --- Template Routes ---

@router.get("/templates", response_model=list[NoteTemplateResponse])
def list_templates_api(db: Session = Depends(get_db)):
    """List all note templates."""
    return list_templates(db)


@router.post("/templates", response_model=NoteTemplateResponse)
def create_template_api(payload: NoteTemplateCreate, db: Session = Depends(get_db)):
    """Create a new note template."""
    template = create_template(
        db,
        name=payload.name,
        content=payload.content,
        icon=payload.icon,
        category=payload.category
    )
    mirror_template_to_vault(settings.vault_path, template)
    return template


@router.patch("/templates/{template_id}", response_model=NoteTemplateResponse)
def update_template_api(template_id: int, payload: NoteTemplateUpdate, db: Session = Depends(get_db)):
    """Update an existing note template."""
    template = update_template(
        db,
        template_id=template_id,
        name=payload.name,
        content=payload.content,
        icon=payload.icon,
        category=payload.category
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    mirror_template_to_vault(settings.vault_path, template)
    return template


@router.delete("/templates/{template_id}")
def delete_template_api(template_id: int, db: Session = Depends(get_db)):
    """Delete a note template."""
    success = delete_template(db, template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    delete_template_file(settings.vault_path, template_id)
    return {"status": "success"}
