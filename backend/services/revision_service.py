"""v0.22.0 · 笔记版本快照服务 (v0.23.4 hotfix: idle-collapse)

策略 (v0.23.4-idle-collapse):
  - 每次 update_note 落盘时旁路调一次 maybe_snapshot()
  - 去重: content 的 sha1 与最新一条相同则跳过
  - 空闲合并 (idle-collapse):
      * 若 hash 变化, 但距离最新一条 auto 快照不足 debounce_seconds
        (用户没"停手"超过 N 秒), 则直接 **原地覆写** 最新那条 auto 快照,
        把它的内容、hash、byte_size、created_at 刷新成本次内容.
        —— 既保证崩溃不丢最新输入, 又不会让历史表刷屏
      * 距离 >= debounce_seconds, 新开一条快照.
        这就是用户"停手 N 秒"后的稳态版本
  - 保留: 同一 note_id 保留 MAX_KEEP 条 + 首版 1 条
  - restore 时先为当前版打一个 source="restore-point" 的兜底快照 (绕过去抖)

策略可经 get_settings()/update_settings() 在运行时调整, 持久化到
data_root/revision_settings.json. debounce_seconds 的语义在本版改为
"停手 N 秒后固化为新历史"

接口:
  - maybe_snapshot(db, note_id, title, content, source="auto") -> NoteRevision | None
  - list_revisions(db, note_id) -> list[NoteRevision]
  - get_revision(db, note_id, revision_id) -> tuple[str, NoteRevision] | None
  - restore_revision(db, note_id, revision_id, current_title, current_content) -> tuple[str, NoteRevision] | None
  - get_settings() -> dict
  - update_settings(partial: dict) -> dict
"""

from __future__ import annotations

import gzip
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from backend.models.db_models import NoteRevision

# 默认策略
# v0.23.4 hotfix (idle-collapse):
#   - debounce 语义改为 "用户停手超过 N 秒后固化新历史"
#   - 默认 10s, 合法范围 [1, 24h], 可以通过 /system/revision-settings 在线修改
DEFAULT_DEBOUNCE_SECONDS = 10
DEFAULT_MAX_KEEP = 50  # 外加首版 1 条

# 合法范围
_MIN_DEBOUNCE = 1
_MAX_DEBOUNCE = 24 * 3600
_MIN_KEEP = 1
_MAX_KEEP_CAP = 1000


def _settings_file() -> Path:
    from backend.config import get_settings as _app_settings
    return _app_settings().data_root / "revision_settings.json"


def _load_settings() -> dict:
    """从 json 文件读取,缺失/损坏则回退默认值."""
    path = _settings_file()
    try:
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {
                    "debounce_seconds": _clamp_int(
                        raw.get("debounce_seconds", DEFAULT_DEBOUNCE_SECONDS),
                        _MIN_DEBOUNCE,
                        _MAX_DEBOUNCE,
                        DEFAULT_DEBOUNCE_SECONDS,
                    ),
                    "max_keep": _clamp_int(
                        raw.get("max_keep", DEFAULT_MAX_KEEP),
                        _MIN_KEEP,
                        _MAX_KEEP_CAP,
                        DEFAULT_MAX_KEEP,
                    ),
                }
    except Exception:
        pass
    return {"debounce_seconds": DEFAULT_DEBOUNCE_SECONDS, "max_keep": DEFAULT_MAX_KEEP}


def _clamp_int(val, lo: int, hi: int, fallback: int) -> int:
    try:
        v = int(val)
    except Exception:
        return fallback
    if v < lo:
        v = lo
    if v > hi:
        v = hi
    return v


def get_settings() -> dict:
    """返回当前策略设置."""
    return _load_settings()


def update_settings(partial: dict) -> dict:
    """部分更新策略设置并持久化到 JSON."""
    current = _load_settings()
    if "debounce_seconds" in partial:
        current["debounce_seconds"] = _clamp_int(
            partial["debounce_seconds"], _MIN_DEBOUNCE, _MAX_DEBOUNCE, current["debounce_seconds"]
        )
    if "max_keep" in partial:
        current["max_keep"] = _clamp_int(
            partial["max_keep"], _MIN_KEEP, _MAX_KEEP_CAP, current["max_keep"]
        )
    try:
        path = _settings_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[revision] persist settings failed: {e}")
    return current


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="replace")).hexdigest()


def _strip_embedded_frontmatter(content: str | None) -> str:
    """v0.22.0-a hotfix10 · 宽松剥离 body 内嵌的 frontmatter.
    兼容 CRLF / 单行压缩 / 尾部无换行 等 hotfix9 漏掉的变体.
    snapshot 写入/读取两端都做一次, 幂等.
    """
    import re
    if not content:
        return content or ""
    body = content
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
            break
        body = stripped[m.end():]
    return body.lstrip("\n")


def _now() -> datetime:
    return datetime.utcnow()


def maybe_snapshot(
    db: Session,
    note_id: int,
    title: str,
    content: str,
    source: str = "auto",
) -> Optional[NoteRevision]:
    """判断是否需要打一条快照,并写入.

    v0.23.4 idle-collapse 策略:
      * 相同 hash       -> 跳过(纯去重)
      * hash 变但距上次 auto 快照 < debounce_seconds 且 source=="auto"
                        -> 原地覆写最新 auto 快照(collapse),不新增行
      * 否则            -> 新增一条
    非 auto 来源(restore/save 等)永远新增,不受 collapse 影响.
    """
    if content is None:
        return None
    # hotfix9: 存入前先清洗, 杜绝"把 frontmatter 当成 body 存快照"的污染链
    content = _strip_embedded_frontmatter(content)
    cfg = _load_settings()
    debounce_seconds = cfg["debounce_seconds"]

    content_hash = _sha1(content)

    latest = (
        db.query(NoteRevision)
        .filter(NoteRevision.note_id == note_id)
        .order_by(desc(NoteRevision.created_at))
        .first()
    )

    now = _now()
    content_bytes = content.encode("utf-8", errors="replace")
    content_gz = gzip.compress(content_bytes, compresslevel=6)

    if latest is not None and source == "auto":
        # 去重
        if latest.content_hash == content_hash:
            return None
        # 空闲合并 (idle-collapse)
        if (
            latest.source == "auto"
            and latest.created_at is not None
            and now - latest.created_at < timedelta(seconds=debounce_seconds)
        ):
            # 用户还在连续输入, 原地刷新最新那条 auto 快照
            latest.content_gz = content_gz
            latest.content_hash = content_hash
            latest.title_snapshot = (title or "")[:255]
            latest.byte_size = len(content_bytes)
            latest.created_at = now  # 推迟稳态固化时刻
            db.flush()
            db.commit()
            db.refresh(latest)
            return latest

    revision = NoteRevision(
        note_id=note_id,
        created_at=now,
        content_gz=content_gz,
        content_hash=content_hash,
        title_snapshot=(title or "")[:255],
        byte_size=len(content_bytes),
        source=source,
    )
    db.add(revision)
    db.flush()  # 拿到 id, 便于后续剪枝

    prune_revisions(db, note_id)

    db.commit()
    db.refresh(revision)
    return revision


def prune_revisions(db: Session, note_id: int) -> int:
    """保留最早 1 条 + 最近 MAX_KEEP 条,返回删除行数."""
    cfg = _load_settings()
    max_keep = cfg["max_keep"]

    rows = (
        db.query(NoteRevision)
        .filter(NoteRevision.note_id == note_id)
        .order_by(asc(NoteRevision.created_at))
        .all()
    )
    if len(rows) <= max_keep + 1:
        return 0

    # 第 0 条保留(首版); 末尾 max_keep 条保留; 其余删除
    # v0.22.0-a hotfix7 · 防御 max_keep==0 时 rows[-0:] 返回全列表的陷阱
    keep_ids = {rows[0].id}
    if max_keep > 0:
        for r in rows[-max_keep:]:
            keep_ids.add(r.id)

    to_delete = [r for r in rows if r.id not in keep_ids]
    for r in to_delete:
        db.delete(r)
    db.flush()
    return len(to_delete)


def list_revisions(db: Session, note_id: int) -> list[NoteRevision]:
    return (
        db.query(NoteRevision)
        .filter(NoteRevision.note_id == note_id)
        .order_by(desc(NoteRevision.created_at))
        .all()
    )


def get_revision(
    db: Session, note_id: int, revision_id: int
) -> Optional[tuple[str, NoteRevision]]:
    rev = (
        db.query(NoteRevision)
        .filter(NoteRevision.note_id == note_id, NoteRevision.id == revision_id)
        .first()
    )
    if rev is None:
        return None
    try:
        content = gzip.decompress(rev.content_gz).decode("utf-8", errors="replace")
    except Exception:
        content = ""
    # hotfix9: 读取时也清洗一次, 兼容 hotfix9 之前写入的已污染快照
    content = _strip_embedded_frontmatter(content)
    return content, rev


def restore_revision(
    db: Session,
    note_id: int,
    revision_id: int,
    current_title: str,
    current_content: str,
) -> Optional[tuple[str, NoteRevision]]:
    """恢复到指定版本.

    流程:
      1. 先为"当前版本"打一条 source="restore-point" 的兜底快照(不受去抖/去重影响)
      2. 读取目标版本的 content 返回给调用方,由调用方覆盖 note.content
    返回: (target_content, target_revision) 或 None
    """
    target = get_revision(db, note_id, revision_id)
    if target is None:
        return None

    # hotfix9: restore-point 的 current_content 也可能是污染的,清洗后再打点
    current_content_clean = _strip_embedded_frontmatter(current_content or "")

    # 1. 先给"当前状态"留一个 restore-point 兜底(绕过去抖/去重)
    try:
        content_hash = _sha1(current_content_clean)
        content_bytes = current_content_clean.encode("utf-8", errors="replace")
        content_gz = gzip.compress(content_bytes, compresslevel=6)
        safety = NoteRevision(
            note_id=note_id,
            created_at=_now(),
            content_gz=content_gz,
            content_hash=content_hash,
            title_snapshot=(current_title or "")[:255],
            byte_size=len(content_bytes),
            source="restore-point",
        )
        db.add(safety)
        db.flush()
        prune_revisions(db, note_id)
        db.commit()
    except Exception:
        db.rollback()

    # 2. 返回目标版本内容
    return target
