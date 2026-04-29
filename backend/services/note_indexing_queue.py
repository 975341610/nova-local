from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Protocol


class ExecutorLike(Protocol):
    def submit(self, fn: Callable[..., None], *args: Any, **kwargs: Any) -> Any:
        ...


class NoteIndexingQueue:
    def __init__(
        self,
        worker: Callable[..., None],
        executor: ExecutorLike | None = None,
    ) -> None:
        self._worker = worker
        self._executor = executor or ThreadPoolExecutor(max_workers=1, thread_name_prefix="note-index")
        self._lock = threading.Lock()
        self._pending: dict[int, tuple[tuple[Any, ...], dict[str, Any]]] = {}
        self._scheduled: set[int] = set()

    def enqueue(self, note_id: int, *args: Any, **kwargs: Any) -> None:
        with self._lock:
            self._pending[note_id] = ((note_id, *args), dict(kwargs))
            if note_id in self._scheduled:
                return
            self._scheduled.add(note_id)

        self._executor.submit(self._drain_note, note_id)

    def _drain_note(self, note_id: int) -> None:
        while True:
            with self._lock:
                task = self._pending.pop(note_id, None)
                if task is None:
                    self._scheduled.discard(note_id)
                    return

            args, kwargs = task
            self._worker(*args, **kwargs)
