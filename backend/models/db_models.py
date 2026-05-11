import base64
import ctypes
import hashlib
import hmac
import os
import secrets
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


_DPAPI_PREFIX = "dpapi:v1:"
_LOCAL_PREFIX = "local:v1:"


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_ulong), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def _dpapi_available() -> bool:
    return sys.platform == "win32"


def _dpapi_protect(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_buffer = ctypes.create_string_buffer(data)
    in_blob = _DataBlob(len(data), ctypes.cast(in_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    out_blob = _DataBlob()
    if not crypt32.CryptProtectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError("CryptProtectData failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _dpapi_unprotect(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_buffer = ctypes.create_string_buffer(data)
    in_blob = _DataBlob(len(data), ctypes.cast(in_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    out_blob = _DataBlob()
    if not crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _local_secret_path() -> Path:
    from backend.config import get_settings

    secret_dir = get_settings().data_root / ".secrets"
    secret_dir.mkdir(parents=True, exist_ok=True)
    secret_path = secret_dir / "model_config.key"
    if not secret_path.exists():
        secret_path.write_bytes(secrets.token_bytes(32))
    return secret_path


def _local_key() -> bytes:
    return hashlib.sha256(_local_secret_path().read_bytes()).digest()


def _xor_stream(data: bytes, key: bytes, nonce: bytes) -> bytes:
    output = bytearray()
    counter = 0
    while len(output) < len(data):
        output.extend(hashlib.sha256(key + nonce + counter.to_bytes(4, "big")).digest())
        counter += 1
    return bytes(value ^ mask for value, mask in zip(data, output))


def _local_encrypt(data: bytes) -> bytes:
    key = _local_key()
    nonce = secrets.token_bytes(16)
    ciphertext = _xor_stream(data, key, nonce)
    tag = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    return nonce + tag + ciphertext


def _local_decrypt(data: bytes) -> bytes:
    key = _local_key()
    nonce, tag, ciphertext = data[:16], data[16:48], data[48:]
    expected = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("model config secret integrity check failed")
    return _xor_stream(ciphertext, key, nonce)


def obfuscate(text: str) -> str:
    if not text:
        return ""
    data = text.encode("utf-8")
    if _dpapi_available():
        return _DPAPI_PREFIX + base64.b64encode(_dpapi_protect(data)).decode("utf-8")
    return _LOCAL_PREFIX + base64.b64encode(_local_encrypt(data)).decode("utf-8")


def deobfuscate(text: str) -> str:
    if not text:
        return ""
    try:
        if text.startswith(_DPAPI_PREFIX):
            payload = base64.b64decode(text[len(_DPAPI_PREFIX):].encode("utf-8"))
            return _dpapi_unprotect(payload).decode("utf-8")
        if text.startswith(_LOCAL_PREFIX):
            payload = base64.b64decode(text[len(_LOCAL_PREFIX):].encode("utf-8"))
            return _local_decrypt(payload).decode("utf-8")
        return text
    except Exception:
        return text


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    icon: Mapped[str] = mapped_column(String(500), default="📒")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notes: Mapped[list["Note"]] = relationship(back_populates="notebook")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), default="Untitled")
    icon: Mapped[str] = mapped_column(String(500), default="📝")
    content: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(500), default="")
    type: Mapped[str] = mapped_column(String(50), default="note")
    notebook_id: Mapped[int | None] = mapped_column(ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("notes.id", ondelete="SET NULL"), nullable=True, index=True)
    is_folder: Mapped[bool] = mapped_column(Integer, default=0)  # 0 for false, 1 for true
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_title_manually_edited: Mapped[bool] = mapped_column(Integer, default=0)  # 0 for false, 1 for true
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notebook: Mapped[Notebook | None] = relationship(back_populates="notes")
    parent: Mapped["Note | None"] = relationship("Note", remote_side=[id], back_populates="children")
    children: Mapped[list["Note"]] = relationship("Note", back_populates="parent", cascade="all, delete-orphan")

    properties: Mapped[list["NoteProperty"]] = relationship(back_populates="note", cascade="all, delete-orphan")

    links_from: Mapped[list["NoteLink"]] = relationship(
        back_populates="source", foreign_keys="NoteLink.source_note_id", cascade="all, delete-orphan"
    )
    links_to: Mapped[list["NoteLink"]] = relationship(
        back_populates="target", foreign_keys="NoteLink.target_note_id", cascade="all, delete-orphan"
    )


class NoteLink(Base):
    __tablename__ = "note_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    target_note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    score: Mapped[float] = mapped_column(Float, default=1.0) # 1.0 for manual links
    link_type: Mapped[str] = mapped_column(String(50), default="manual") # manual, ai
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source: Mapped[Note] = relationship(back_populates="links_from", foreign_keys=[source_note_id])
    target: Mapped[Note] = relationship(back_populates="links_to", foreign_keys=[target_note_id])


class NoteProperty(Base):
    __tablename__ = "note_properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    type: Mapped[str] = mapped_column(String(50))  # text, number, date, select, multi_select
    value: Mapped[str] = mapped_column(Text)  # JSON string for complex values

    note: Mapped[Note] = relationship(back_populates="properties")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(20), default="todo")
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    task_type: Mapped[str] = mapped_column(String(50), default="work")
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider: Mapped[str] = mapped_column(String(50), default="openclaw")
    api_key: Mapped[str] = mapped_column(Text, default="")
    base_url: Mapped[str] = mapped_column(String(255), default="")
    model_name: Mapped[str] = mapped_column(String(255), default="glm-4.7-flash")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserStats(Base):
    __tablename__ = "user_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    exp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    total_captures: Mapped[int] = mapped_column(Integer, default=0)
    current_theme: Mapped[str] = mapped_column(String(50), default="default")
    wallpaper_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(500))
    condition_type: Mapped[str] = mapped_column(String(50))  # e.g., "total_captures", "total_notes"
    condition_value: Mapped[int] = mapped_column(Integer)
    icon: Mapped[str] = mapped_column(String(500))  # SVG or Emoji
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    achievement_id: Mapped[int] = mapped_column(ForeignKey("achievements.id", ondelete="CASCADE"), index=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    achievement: Mapped[Achievement] = relationship()


class NoteTemplate(Base):
    __tablename__ = "note_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    content: Mapped[str] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(500), default="📄")
    category: Mapped[str] = mapped_column(String(50), default="general")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# v0.22.0 · 笔记版本快照
class NoteRevision(Base):
    __tablename__ = "note_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
    # gzip(content.encode("utf-8"))
    content_gz: Mapped[bytes] = mapped_column(LargeBinary)
    content_hash: Mapped[str] = mapped_column(String(40), index=True)
    title_snapshot: Mapped[str] = mapped_column(String(255), default="")
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    # 手动触发("save","restore-point") vs 自动("auto")
    source: Mapped[str] = mapped_column(String(16), default="auto")
