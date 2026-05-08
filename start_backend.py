"""Nova backend launcher.

Locates the `backend` Python package across the supported APP_ROOT layouts
(legacy flat / versioned `current/` junction / explicit `versions/<ver>/`)
before booting uvicorn.

Background
----------
v0.23.0 introduced a versioned APP_ROOT (`versions/<X.Y.Z>/` + a `current`
junction).  Different launch paths land this script in different cwd's:

    * NovaRoot  (start_windows.bat on a legacy install)
    * versions/<X.Y.Z>  (start_windows.bat after upgrade)
    * current/  (junction -> versions/<X.Y.Z>)

Relying on cwd is brittle, so we resolve sys.path here based on where the
`backend/` directory actually lives, in priority order:

    1. <script dir>/backend            - versioned slot
    2. <script dir>/current/backend    - NovaRoot, current -> versions/<ver>
    3. newest <script dir>/versions/*/backend

Whichever match wins, its parent goes onto sys.path[0] so `backend.main` is
importable regardless of cwd.
"""

import os
import sys


def _resolve_backend_root():
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
print(f"[start_backend] backend root = {_root}", flush=True)

# Optional GPU runtime -- fine to be missing.
try:
    import llama_cpp  # noqa: F401
except ImportError:
    pass

import uvicorn  # noqa: E402

if __name__ == "__main__":
    if _root is None:
        print(
            "[start_backend] FATAL: could not locate backend/ next to this script "
            "or under current/ or versions/*",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(2)

    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
