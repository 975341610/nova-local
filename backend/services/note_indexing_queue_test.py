from __future__ import annotations

from backend.services.note_indexing_queue import NoteIndexingQueue


class InlineExecutor:
    def __init__(self):
        self.submitted = []

    def submit(self, fn, *args, **kwargs):
        self.submitted.append((fn, args, kwargs))
        return None


def test_note_indexing_queue_coalesces_pending_work_by_note_id():
    calls = []
    executor = InlineExecutor()
    queue = NoteIndexingQueue(worker=lambda *args, **kwargs: calls.append((args, kwargs)), executor=executor)

    queue.enqueue(7, "old-title", "old-content")
    queue.enqueue(7, "new-title", "new-content")

    assert len(executor.submitted) == 1

    fn, args, kwargs = executor.submitted[0]
    fn(*args, **kwargs)

    assert calls == [((7, "new-title", "new-content"), {})]


def test_note_indexing_queue_schedules_distinct_notes_independently():
    calls = []
    executor = InlineExecutor()
    queue = NoteIndexingQueue(worker=lambda *args, **kwargs: calls.append((args, kwargs)), executor=executor)

    queue.enqueue(7, "note-7", "content-7")
    queue.enqueue(8, "note-8", "content-8")

    assert len(executor.submitted) == 2
