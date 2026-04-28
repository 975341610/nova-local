import asyncio
import sys
import types

from backend.services.local_ai import LocalAIManager


class FakeOllamaProcess:
    def __init__(self):
        self.terminated = False
        self.killed = False

    def poll(self):
        return None

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        return 0

    def kill(self):
        self.killed = True


def test_stop_ollama_server_only_stops_owned_child_process(monkeypatch):
    fake_psutil = types.SimpleNamespace(
        process_iter=lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("global process scan not allowed")),
        TimeoutExpired=TimeoutError,
        NoSuchProcess=Exception,
        AccessDenied=Exception,
        ZombieProcess=Exception,
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    manager = LocalAIManager()
    process = FakeOllamaProcess()
    manager._ollama_process = process

    assert asyncio.run(manager.stop_ollama_server()) is True
    assert process.terminated is True
    assert process.killed is False
    assert manager._ollama_process is None


def test_shutdown_only_stops_owned_child_process(monkeypatch):
    fake_psutil = types.SimpleNamespace(
        process_iter=lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("global process scan not allowed")),
    )
    monkeypatch.setitem(sys.modules, "psutil", fake_psutil)

    manager = LocalAIManager()
    process = FakeOllamaProcess()
    manager._ollama_process = process

    manager.shutdown()

    assert process.killed is True
    assert manager._ollama_process is None
