from __future__ import annotations

from typing import Any, Optional

from backend.config import get_settings


class VectorStore:
    """
    ChromaDB 向量存储封装。
    
    使用懒加载（Lazy Init）策略：chromadb 及相关依赖在第一次真正
    被调用时才导入和初始化，而不是在模块被加载时立即执行。
    
    这是解决 PyInstaller 打包时 chromadb 循环导入报错的根本方案：
    在 chromadb/__init__.py 被加载时，chromadb/api/__init__.py 会执行
    `import chromadb.utils.embedding_functions as ef`，触发循环导入。
    通过延迟 import，可以确保 Python 解释器已完全初始化再去碰 chromadb。
    """

    def __init__(self) -> None:
        self._client = None
        self._collection = None

    def _ensure_init(self) -> None:
        """确保 chromadb 客户端和集合已初始化（懒加载核心逻辑）。"""
        if self._collection is not None:
            return

        # 🚀 延迟到这里才真正导入 chromadb，避免模块加载时循环导入
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        # 定义一个空嵌入函数：我们的 embedding 由前端/AI客户端负责生成，
        # 后端只负责存取，不需要 chromadb 的默认 ONNX 模型。
        class _NoEmbedding:
            def __call__(self, input):
                return []

        settings = get_settings()
        self._client = chromadb.PersistentClient(
            path=settings.chroma_path,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name="second_brain_chunks",
            metadata={"hnsw:space": "cosine"},
            embedding_function=_NoEmbedding(),
        )

    def upsert_chunks(self, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        self._ensure_init()
        self._collection.upsert(
            ids=[item["id"] for item in items],
            documents=[item["document"] for item in items],
            metadatas=[item["metadata"] for item in items],
            embeddings=[item["embedding"] for item in items],
        )

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[dict[str, Any]]:
        self._ensure_init()
        result = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
        )
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        items = []
        for chunk_id, document, metadata, distance in zip(ids, documents, metadatas, distances):
            items.append(
                {
                    "chunk_id": chunk_id,
                    "document": document,
                    "metadata": metadata,
                    "score": max(0.0, 1 - float(distance)),
                }
            )
        return items

    def delete_note_chunks(self, note_id: int) -> None:
        self._ensure_init()
        self._collection.delete(where={"note_id": note_id})


# 全局单例——此处只是定义对象，不触发任何 chromadb 导入
vector_store = VectorStore()
