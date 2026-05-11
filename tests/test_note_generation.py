import asyncio

from backend.services.note_generation import (
    build_structured_note_prompt,
    generate_fallback_structured_note,
    generate_structured_note,
)


NORMALIZED_CONTENT = {
    "source_type": "file",
    "title": "项目复盘",
    "blocks": [
        {"type": "heading", "text": "项目复盘", "metadata": {}},
        {"type": "paragraph", "text": "本周完成远程 AI 修复，并开始文档导入。", "metadata": {}},
        {"type": "list", "text": "补充测试\n整理发布包", "metadata": {}},
    ],
    "plain_text": "项目复盘\n本周完成远程 AI 修复，并开始文档导入。\n补充测试\n整理发布包",
    "metadata": {"source_name": "retro.md"},
}


def test_build_structured_note_prompt_requires_nova_note_sections():
    messages = build_structured_note_prompt(NORMALIZED_CONTENT)
    joined = "\n".join(message["content"] for message in messages)

    assert "## 摘要" in joined
    assert "## 核心要点" in joined
    assert "## 详细整理" in joined
    assert "## 待办 / 后续行动" in joined
    assert "Return only clean Markdown" in joined
    assert "项目复盘" in joined
    assert "本周完成远程 AI 修复" in joined


def test_generate_fallback_structured_note_returns_markdown_when_ai_unavailable():
    result = generate_fallback_structured_note(NORMALIZED_CONTENT)

    assert result["title"] == "项目复盘"
    assert result["source_type"] == "file"


def test_build_structured_note_prompt_requires_reference_section():
    messages = build_structured_note_prompt(NORMALIZED_CONTENT)
    joined = "\n".join(message["content"] for message in messages)

    assert "## 引用资料" in joined


def test_generate_fallback_structured_note_renders_file_reference_details():
    result = generate_fallback_structured_note(NORMALIZED_CONTENT)

    assert "## 引用资料" in result["markdown"]
    assert "retro.md" in result["markdown"]
    assert result["metadata"]["source_name"] == "retro.md"

def test_generate_fallback_structured_note_renders_url_reference_details():
    content = {
        **NORMALIZED_CONTENT,
        "source_type": "url",
        "metadata": {
            "source_refs": [
                {"kind": "url", "title": "Example Article", "url": "https://example.com/article"},
                {"kind": "video", "title": "Demo Video", "url": "https://youtu.be/demo"},
            ]
        },
    }

    result = generate_fallback_structured_note(content)

    assert "## 引用资料" in result["markdown"]
    assert "Example Article" in result["markdown"]
    assert "https://example.com/article" in result["markdown"]
    assert "Demo Video" in result["markdown"]
    assert "https://youtu.be/demo" in result["markdown"]


def test_generate_fallback_structured_note_uses_video_template_shape():
    content = {
        **NORMALIZED_CONTENT,
        "title": "Demo Video",
        "source_type": "url",
        "plain_text": "- Uploader: Nova\n00:00 开场\n03:15 示例演示",
        "metadata": {
            "template_id": "video",
            "source_refs": [
                {"kind": "video", "title": "Demo Video", "url": "https://www.youtube.com/watch?v=demo"},
            ],
        },
    }

    result = generate_fallback_structured_note(content)

    assert "## 视频：Demo Video" in result["markdown"]
    assert "- 来源：https://www.youtube.com/watch?v=demo" in result["markdown"]
    assert "- 作者：Nova" in result["markdown"]
    assert "### 一句话总结" in result["markdown"]
    assert "### 时间线" in result["markdown"]
    assert "- 03:15 示例演示" in result["markdown"]
    assert "## 引用资料" in result["markdown"]


async def _empty_stream(*args, **kwargs):
    if False:
        yield ""


class EmptyAIClient:
    def stream_chat(self, messages, config):
        return _empty_stream(messages, config)


async def _markdown_stream(*args, **kwargs):
    yield "## 摘要\n"
    yield "远程模型生成的笔记。"


class StreamingAIClient:
    def stream_chat(self, messages, config):
        return _markdown_stream(messages, config)


def test_generate_structured_note_falls_back_without_remote_config():
    result = asyncio.run(generate_structured_note(NORMALIZED_CONTENT, EmptyAIClient(), None))

    assert result["title"] == "项目复盘"
    assert "## 摘要" in result["markdown"]
    assert "本周完成远程 AI 修复" in result["markdown"]


def test_generate_structured_note_collects_remote_markdown():
    result = asyncio.run(generate_structured_note(
        NORMALIZED_CONTENT,
        StreamingAIClient(),
        {"api_key": "sk-test", "base_url": "https://example.com/v1", "model_name": "test"},
    ))

    assert result["title"] == "项目复盘"
    assert result["markdown"].startswith("## 摘要\n远程模型生成的笔记。")
    assert "## 引用资料" in result["markdown"]
    assert "retro.md" in result["markdown"]
    assert result["source_type"] == "file"

