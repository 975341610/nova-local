from __future__ import annotations

from typing import Any

from backend.services.document_service import combine_imported_documents_for_note_generation
from backend.services.note_generation import generate_structured_note


async def generate_note_from_imported_documents(
    *,
    documents: list[dict[str, Any]],
    template_id: str = "general",
    ai_client: Any,
    llm_config: dict[str, str] | None,
) -> dict[str, Any]:
    normalized = combine_imported_documents_for_note_generation(documents, template_id=template_id)
    generated = await generate_structured_note(normalized, ai_client, llm_config)
    generated.setdefault("metadata", normalized.get("metadata", {}))
    generated.setdefault("source_type", normalized.get("source_type", "file"))
    return generated
