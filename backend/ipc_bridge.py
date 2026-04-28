import sys
import json
import os
from pathlib import Path

# Ensure project root is in path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from backend.services.spellcheck_engine import spellcheck_engine
from backend.services.local_ai import local_ai_manager
from backend.database import SessionLocal
from backend.services import repositories
from backend.models.schemas import NoteCreate, NoteUpdate, NotebookCreate, NotebookUpdate, TaskCreate, TaskUpdate

def note_to_dict(note, include_content=True):
    if not note: return None
    d = {
        "id": note.id,
        "title": note.title,
        "summary": note.summary,
        "type": note.type,
        "file_path": getattr(note, "file_path", None),
        "background_paper": getattr(note, "background_paper", None),
        "sort_key": getattr(note, "sort_key", None),
        "stickers": getattr(note, "stickers", []) or [],
        "sticky_notes": getattr(note, "sticky_notes", []) or [],
        "tags": [t for t in note.tags.split(",") if t] if note.tags else [],
        "notebook_id": note.notebook_id,
        "parent_id": note.parent_id,
        "position": note.position,
        "icon": note.icon,
        "is_folder": bool(note.is_folder),
        "is_title_manually_edited": bool(note.is_title_manually_edited),
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if hasattr(note, 'updated_at') and note.updated_at else None,
        "deleted_at": note.deleted_at.isoformat() if note.deleted_at else None,
    }
    if include_content:
        d["content"] = note.content
    return d

def notebook_to_dict(nb):
    if not nb: return None
    return {
        "id": nb.id,
        "name": nb.name,
        "icon": nb.icon,
        "created_at": nb.created_at.isoformat() if nb.created_at else None,
        "deleted_at": nb.deleted_at.isoformat() if nb.deleted_at else None,
    }

def task_to_dict(task):
    if not task: return None
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "task_type": task.task_type,
        "deadline": task.deadline.isoformat() if task.deadline else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


def template_to_dict(template):
    if not template:
        return None
    return {
        "id": template.id,
        "name": template.name,
        "content": template.content,
        "icon": template.icon,
        "category": template.category,
        "created_at": template.created_at.isoformat() if template.created_at else None,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command"}))
        return

    command = sys.argv[1]
    params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    
    db = SessionLocal()
    try:
        if command == "notes:list":
            notes = repositories.list_notes(db, include_content=False)
            print(json.dumps([note_to_dict(n, include_content=False) for n in notes]))

        elif command == "notes:get":
            note = repositories.get_note(db, params.get("id"))
            print(json.dumps(note_to_dict(note, include_content=True)))
        
        elif command == "notebooks:list":
            notebooks = repositories.list_notebooks(db)
            print(json.dumps([notebook_to_dict(nb) for nb in notebooks]))

        elif command == "notes:create":
            note = repositories.create_note(
                db, 
                title=params.get("title", "未命名笔记"),
                content=params.get("content", ""),
                summary="",
                tags=params.get("tags"),
                notebook_id=params.get("notebook_id"),
                icon=params.get("icon", "📝"),
                type=params.get("type", "note"),
                parent_id=params.get("parent_id"),
                is_folder=params.get("is_folder", False),
                is_title_manually_edited=params.get("is_title_manually_edited", False),
                background_paper=params.get("background_paper"),
                sort_key=params.get("sort_key"),
                stickers=params.get("stickers"),
                sticky_notes=params.get("sticky_notes"),
            )
            print(json.dumps(note_to_dict(note)))

        elif command == "folders:create":
            note = repositories.create_note(
                db, 
                title=params.get("title", "新建文件夹"),
                content="",
                summary="",
                tags=params.get("tags"),
                notebook_id=params.get("notebook_id"),
                icon=params.get("icon", "📂"),
                type=params.get("type", "note"),
                parent_id=params.get("parent_id"),
                is_folder=True,
                is_title_manually_edited=False
            )
            print(json.dumps(note_to_dict(note)))

        elif command == "notes:update":
            # Only pass keys that are explicitly in params to avoid overwriting with None
            update_keys = ["title", "content", "tags", "icon", "type", "parent_id", "is_folder", "is_title_manually_edited", "background_paper", "sort_key", "stickers", "sticky_notes", "properties"]
            kwargs = {k: params[k] for k in update_keys if k in params}
            note = repositories.update_note(
                db,
                note_id=params.get("id"),
                **kwargs
            )
            print(json.dumps(note_to_dict(note)))

        elif command == "notes:delete":
            repositories.soft_delete_note(db, params.get("id"))
            print(json.dumps({"status": "ok"}))

        elif command == "notes:move":
            note = repositories.move_note(
                db,
                note_id=params.get("id"),
                notebook_id=params.get("notebook_id"),
                position=params.get("position", 0),
                parent_id=params.get("parent_id")
            )
            print(json.dumps(note_to_dict(note)))

        elif command == "notebooks:create":
            nb = repositories.create_notebook(db, name=params.get("name"), icon=params.get("icon", "📒"))
            print(json.dumps(notebook_to_dict(nb)))

        elif command == "notebooks:update":
            nb = repositories.update_notebook(db, notebook_id=params.get("id"), name=params.get("name"), icon=params.get("icon"))
            print(json.dumps(notebook_to_dict(nb)))

        elif command == "notebooks:delete":
            repositories.soft_delete_notebook(db, params.get("id"))
            print(json.dumps({"status": "ok"}))

        elif command == "notebooks:restore":
            nb = repositories.restore_notebook(db, params.get("id"))
            print(json.dumps(notebook_to_dict(nb)))

        elif command == "notebooks:purge":
            repositories.purge_notebook(db, params.get("id"))
            print(json.dumps({"status": "ok"}))

        elif command == "notes:update-tags":
            note = repositories.update_note(db, note_id=params.get("id"), tags=params.get("tags"))
            print(json.dumps(note_to_dict(note)))

        elif command == "notes:bulk-move":
            notes = repositories.bulk_move_notes(db, note_ids=params.get("note_ids"), notebook_id=params.get("notebook_id"), position=params.get("position", 0), parent_id=params.get("parent_id"))
            print(json.dumps({"notes": [note_to_dict(n) for n in notes]}))

        elif command == "notes:bulk-delete":
            notes = repositories.bulk_soft_delete_notes(db, note_ids=params.get("note_ids"))
            print(json.dumps({"notes": [note_to_dict(n) for n in notes]}))

        elif command == "notes:restore":
            note = repositories.restore_note(db, params.get("id"))
            print(json.dumps(note_to_dict(note)))

        elif command == "notes:purge":
            repositories.purge_note(db, params.get("id"))
            print(json.dumps({"status": "ok"}))

        elif command == "trash:purge":
            repositories.purge_trash(db)
            print(json.dumps({"status": "ok"}))

        elif command == "tasks:create":
            task = repositories.create_task(db, title=params.get("title"), status=params.get("status", "todo"), priority=params.get("priority", "medium"), task_type=params.get("task_type", "work"), deadline=params.get("deadline"))
            print(json.dumps(task_to_dict(task)))

        elif command == "tasks:update":
            task = repositories.update_task(db, task_id=params.get("id"), title=params.get("title"), status=params.get("status"), priority=params.get("priority"), task_type=params.get("task_type"), deadline=params.get("deadline"))
            print(json.dumps(task_to_dict(task)))

        elif command == "tasks:delete":
            repositories.delete_task(db, params.get("id"))
            print(json.dumps({"status": "ok"}))

        elif command == "tasks:clear-completed":
            repositories.clear_completed_tasks(db)
            print(json.dumps({"status": "ok"}))

        elif command == "config:get-model":
            config = repositories.get_or_create_model_config(db)
            print(json.dumps({
                "provider": config.provider,
                "api_key_masked": repositories.mask_api_key(config.api_key),
                "base_url": config.base_url,
                "model_name": config.model_name
            }))

        elif command == "config:update-model":
            config = repositories.update_model_config(db, provider=params.get("provider"), api_key=params.get("api_key"), base_url=params.get("base_url"), model_name=params.get("model_name"))
            print(json.dumps({
                "provider": config.provider,
                "api_key_masked": repositories.mask_api_key(config.api_key),
                "base_url": config.base_url,
                "model_name": config.model_name
            }))

        elif command == "user:get-stats":
            stats = repositories.get_or_create_user_stats(db)
            print(json.dumps({
                "exp": stats.exp,
                "level": stats.level,
                "total_captures": stats.total_captures,
                "current_theme": stats.current_theme,
                "wallpaper_url": stats.wallpaper_url
            }))

        elif command == "user:list-achievements":
            achievements = repositories.list_user_achievements(db)
            print(json.dumps([{
                "achievement_id": ua.achievement_id,
                "unlocked_at": ua.unlocked_at.isoformat() if ua.unlocked_at else None
            } for ua in achievements]))

        elif command == "user:update-theme":
            stats = repositories.update_user_theme(db, params.get("theme"))
            print(json.dumps({"exp": stats.exp, "level": stats.level, "current_theme": stats.current_theme}))

        elif command == "user:update-wallpaper":
            stats = repositories.update_user_wallpaper(db, params.get("wallpaper_url"))
            print(json.dumps({"exp": stats.exp, "level": stats.level, "wallpaper_url": stats.wallpaper_url}))

        elif command == "templates:list":
            templates = repositories.list_templates(db)
            print(json.dumps([template_to_dict(template) for template in templates]))

        elif command == "templates:create":
            template = repositories.create_template(
                db,
                name=params.get("name", "New Template"),
                content=params.get("content", ""),
                icon=params.get("icon", "🗂"),
                category=params.get("category", "general"),
            )
            print(json.dumps(template_to_dict(template)))

        elif command == "templates:update":
            template = repositories.update_template(
                db,
                template_id=params.get("id"),
                name=params.get("name"),
                content=params.get("content"),
                icon=params.get("icon"),
                category=params.get("category"),
            )
            print(json.dumps(template_to_dict(template)))

        elif command == "templates:delete":
            repositories.delete_template(db, params.get("id"))
            print(json.dumps({"status": "ok"}))

        elif command == "text:dictionary:import":
            # Direct use of spellcheck_engine to keep it consistent with routes.py
            text = params.get("text", "")
            if not text:
                print(json.dumps({"error": "Empty text"}))
            else:
                try:
                    count = spellcheck_engine.import_from_text(text)
                    print(json.dumps({"status": "success", "count": count, "message": f"Successfully imported {count} rules"}))
                except Exception as e:
                    print(json.dumps({"error": str(e)}))

        elif command == "text:spellcheck":
            text = params.get("text", "")
            errors = spellcheck_engine.check(text) if text else []
            print(json.dumps({"errors": errors}))

        elif command == "ai:plugin-status":
            from backend.api import routes
            print(json.dumps({"enabled": routes.ai_enabled}))

        elif command == "ai:toggle-plugin":
            from backend.api.routes import toggle_ai_plugin
            from fastapi import BackgroundTasks
            import asyncio
            async def run():
                bg = BackgroundTasks()
                await toggle_ai_plugin(params, bg)
                from backend.api import routes
                return {"enabled": routes.ai_enabled}
            print(json.dumps(asyncio.run(run())))

        elif command == "system:version":
            print(json.dumps({
                "version": "0.10.2",
                "git_commit": "7fb7e2f",
                "build_time": "2026-04-09",
                "executable": sys.executable
            }))

        elif command == "bgm:list":
            from backend.config import get_settings
            settings = get_settings()
            bgm_path = Path(settings.data_root) / "bgm"
            files = []
            if bgm_path.exists():
                for ext in ["*.mp3", "*.wav", "*.ogg"]:
                    files.extend([f.name for f in bgm_path.glob(ext)])
            print(json.dumps(sorted(files)))

        elif command == "ai:ask":
            # For AI, we still use the AIClient which might be slow.
            # In a real local-first app, this could be handled differently.
            from backend.services.ai_client import AIClient
            from backend.rag.pipeline import search_knowledge, citations_from_results
            ai_client = AIClient()
            model_config = repositories.get_or_create_model_config(db)
            llm_config = {
                "provider": model_config.provider,
                "api_key": model_config.api_key,
                "base_url": model_config.base_url,
                "model_name": model_config.model_name,
            }
            
            question = params.get("question")
            mode = params.get("mode", "chat")
            
            import asyncio
            async def run_ask():
                if mode == "chat":
                    answer = await ai_client.answer(question, [], llm_config)
                    return {"answer": answer, "citations": [], "mode": "chat"}
                elif mode == "rag":
                    results = await search_knowledge(question, ai_client=ai_client)
                    citations = citations_from_results(db, results)
                    answer = await ai_client.answer(question, citations, llm_config)
                    return {"answer": answer, "citations": citations, "mode": "rag"}
                return {"error": "Unsupported mode in bridge"}
            
            result = asyncio.run(run_ask())
            print(json.dumps(result))

        elif command == "media:music-library":
            from backend.config import get_settings
            settings = get_settings()
            music_dir = Path(settings.music_path)
            if not music_dir.exists():
                music_dir.mkdir(parents=True, exist_ok=True)
            
            tracks = []
            extensions = {'.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac'}
            img_extensions = {'.jpg', '.png', '.jpeg', '.webp'}
            
            if music_dir.exists():
                files = sorted(list(music_dir.iterdir()))
                for file in files:
                    if file.suffix.lower() in extensions:
                        title = file.stem
                        cover = None
                        for img_ext in img_extensions:
                            img_file = music_dir / f"{title}{img_ext}"
                            if img_file.exists():
                                cover = f"/api/media/music/{img_file.name}"
                                break
                        
                        tracks.append({
                            "url": f"/api/media/music/{file.name}",
                            "title": title,
                            "artist": "本地音频",
                            "cover": cover
                        })
                    elif file.suffix.lower() == '.json':
                        try:
                            with open(file, "r", encoding="utf-8") as f:
                                data = json.load(f)
                                if "url" in data and "title" in data:
                                    tracks.append({
                                        "url": data["url"],
                                        "title": data["title"],
                                        "artist": data.get("artist", "网络直链"),
                                        "cover": data.get("cover")
                                    })
                        except Exception:
                            pass
            print(json.dumps(tracks))

        elif command == "media:music-link":
            from backend.config import get_settings
            settings = get_settings()
            title = params.get("title")
            url = params.get("url")
            cover = params.get("cover")
            if not title or not url:
                print(json.dumps({"error": "Title and URL are required"}))
            else:
                music_dir = Path(settings.music_path)
                music_dir.mkdir(parents=True, exist_ok=True)
                json_path = music_dir / f"{title}.json"
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "title": title, 
                        "url": url, 
                        "cover": cover, 
                        "artist": "网络直链"
                    }, f, ensure_ascii=False, indent=2)
                print(json.dumps({"status": "success", "path": str(json_path)}))

            
        else:
            print(json.dumps({"error": f"Unknown command: {command}"}))
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        db.close()

if __name__ == "__main__":
    main()
