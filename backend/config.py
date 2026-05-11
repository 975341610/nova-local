import json
from functools import lru_cache
from pathlib import Path
import sys

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


def resource_root() -> Path:
    """Return the application resource root for static frontend and bundled assets."""
    if getattr(sys, "frozen", False):
        # PyInstaller extraction directory in packaged builds.
        import sys as _sys
        return Path(getattr(_sys, "_MEIPASS", _sys.executable))
    return PROJECT_DIR


def runtime_root() -> Path:
    """Return the runtime root for persistent data such as DBs and uploads."""
    if getattr(sys, "frozen", False):
        # Directory containing the packaged executable.
        return Path(sys.executable).resolve().parent
    # In development, prefer the current workspace when it already owns data/.
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
    
    # Base data path. Defaults to runtime_root() / "data".
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
    ]
    desktop_local_token: str = Field(default="", validation_alias="NOVA_DESKTOP_TOKEN")
    # Legacy escape hatch for desktop-only operations that have moved to Electron IPC.
    enable_legacy_system_http: bool = Field(default=False, validation_alias="NOVA_ENABLE_LEGACY_SYSTEM_HTTP")
    access_token: str = ""  # Optional bearer token. Empty disables auth in desktop mode.
    run_mode: str = Field(default="desktop_local", validation_alias="RUN_MODE")
    model_config = SettingsConfigDict(env_file=str(runtime_root() / ".env"), extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    # Ensure runtime directories exist before services start.
    settings.data_root.mkdir(parents=True, exist_ok=True)
    Path(settings.vault_path).mkdir(parents=True, exist_ok=True)
    Path(settings.sqlite_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.chroma_path).mkdir(parents=True, exist_ok=True)
    Path(settings.uploads_path).mkdir(parents=True, exist_ok=True)
    Path(settings.music_path).mkdir(parents=True, exist_ok=True)
    Path(settings.stickers_path).mkdir(parents=True, exist_ok=True)
    return settings

