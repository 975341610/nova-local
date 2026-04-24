import json
from functools import lru_cache
from pathlib import Path
import sys

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


def resource_root() -> Path:
    """鑾峰彇绋嬪簭璧勬簮鏍圭洰褰曪紙鐢ㄤ簬鍓嶇闈欐€佹枃浠躲€佸唴缃祫婧愶級"""
    if getattr(sys, "frozen", False):
        # PyInstaller 鎵撳寘鍚庣殑涓存椂瑙ｅ帇鐩綍
        import sys as _sys
        return Path(getattr(_sys, "_MEIPASS", _sys.executable))
    return PROJECT_DIR


def runtime_root() -> Path:
    """鑾峰彇绋嬪簭杩愯鏃舵牴鐩綍锛堢敤浜庢暟鎹簱銆佷笂浼犳枃浠剁瓑闇€瑕佹寔涔呭寲鐨勬暟鎹級"""
    if getattr(sys, "frozen", False):
        # exe 鎵€鍦ㄧ洰褰?
        return Path(sys.executable).resolve().parent
    # 寮€鍙戠幆澧冧笅锛屼紭鍏堟鏌ュ伐浣滅洰褰曚笅鐨?data 鏄惁瀛樺湪
    if (Path.cwd() / "data").exists():
        return Path.cwd()
    return PROJECT_DIR


def get_custom_config_path() -> Path:
    return runtime_root() / "data_config.json"


def load_custom_data_path() -> str | None:
    config_path = get_custom_config_path()
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
                return config.get("data_path")
        except Exception:
            pass
    return None


class Settings(BaseSettings):
    app_name: str = "Second Brain AI"
    api_prefix: str = "/api"
    
    # 鍩虹璺緞锛岄粯璁ゆ寚鍚?runtime_root() / 'data'
    data_root: Path = Field(default_factory=lambda: Path(load_custom_data_path() or (runtime_root() / "data")))

    @property
    def vault_path(self) -> str:
        return (self.data_root / "vault").as_posix()
    
    @property
    def sqlite_url(self) -> str:
        return f"sqlite:///{(self.data_root / 'second_brain.db').as_posix()}"
    
    @property
    def chroma_path(self) -> str:
        return (self.data_root / "chroma_store").as_posix()
        
    @property
    def uploads_path(self) -> str:
        return (Path(self.vault_path) / "_assets").as_posix()
        
    @property
    def music_path(self) -> str:
        return (self.data_root / "music").as_posix()

    @property
    def stickers_path(self) -> str:
        return (self.data_root / "stickers").as_posix()

    @property
    def emoticons_path(self) -> str:
        return (self.data_root / "emoticons").as_posix()

    @property
    def sample_docs_path(self) -> str:
        return (self.data_root / "sample_docs").as_posix()

    default_provider: str = "openclaw"
    default_model: str = "glm-4.7-flash"
    openclaw_api_key: str = ""
    openclaw_base_url: str = "https://api.openclaw.ai/v1"
    embedding_dimension: int = 256
    chunk_size_words: int = 650
    chunk_overlap_words: int = 80
    top_k: int = 5
    cors_origins: list[str] = [
        "http://127.0.0.1",
        "http://localhost",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "null",
    ]
    desktop_local_token: str = Field(default="", validation_alias="NOVA_DESKTOP_TOKEN")
    access_token: str = ""  # 璁块棶瀵嗛挜锛屼负绌哄垯涓嶅紑鍚璇?
    model_config = SettingsConfigDict(env_file=str(runtime_root() / ".env"), extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    # 纭繚鐩綍瀛樺湪
    settings.data_root.mkdir(parents=True, exist_ok=True)
    Path(settings.vault_path).mkdir(parents=True, exist_ok=True)
    Path(settings.sqlite_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    Path(settings.music_path).mkdir(parents=True, exist_ok=True)
    Path(settings.stickers_path).mkdir(parents=True, exist_ok=True)
    return settings

