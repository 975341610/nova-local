from __future__ import annotations

import json
import subprocess
import sys


def test_cli_accepts_utf8_bom_prefixed_stdin(tmp_path):
    payload = "\ufeff" + json.dumps({"action": "get_current_version", "args": {}})

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "backend.services.updater_cli",
            "--app-root",
            str(tmp_path),
        ],
        input=payload,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is None
