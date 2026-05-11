"""Nova updater CLI launcher (v0.23.3).

Shim that makes `backend.services.updater_cli` importable regardless of:
    * cwd (bat-launched / Electron-spawned / IDE-launched)
    * APP_ROOT layout (flat vs. versioned `current/` junction)
    * whether electron-side spawn passes PYTHONPATH correctly

This mirrors `start_backend.py::_resolve_backend_root()` so both launchers
share the exact same sys.path resolution policy. Belt-and-suspenders: the
Electron bridge (`updaterBridge.js`) also injects PYTHONPATH, but if that
injection ever regresses, this shim still finds `backend/` on its own.

Invocation (from Electron):
    <python-exe> <APP_ROOT>/start_updater_cli.py --app-root <APP_ROOT>
with the JSON request on stdin and the JSON response on stdout, exactly
like `python -m backend.services.updater_cli`.
"""
from __future__ import annotations

import os
import sys


def _resolve_backend_root() -> str | None:
    here = os.path.dirname(os.path.abspath(__file__))

    # 1) sibling backend/ -- versioned slot or dev checkout
    if os.path.isdir(os.path.join(here, "backend")):
        return here

    # 2) current/ junction (NovaRoot launcher after versioned upgrade)
    cur = os.path.join(here, "current")
    if os.path.isdir(os.path.join(cur, "backend")):
        return cur

    # 3) scan versions/* and pick the newest with backend/
    vroot = os.path.join(here, "versions")
    if os.path.isdir(vroot):
        try:
            slots = sorted(os.listdir(vroot), reverse=True)
        except OSError:
            slots = []
        for slot in slots:
            cand = os.path.join(vroot, slot)
            if os.path.isdir(os.path.join(cand, "backend")):
                return cand

    return None


_root = _resolve_backend_root()
if _root and _root not in sys.path:
    sys.path.insert(0, _root)

if _root is None:
    sys.stderr.write(
        "[start_updater_cli] FATAL: could not locate backend/ next to this "
        "script, under current/, or in versions/*\n"
    )
    sys.exit(2)

# Delegate to the real module; it handles argparse + stdin/stdout JSON.
from backend.services.updater_cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
