#!/usr/bin/env python3
"""Launch the standalone Grand Pixel Game launcher."""
from __future__ import annotations
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Prefer venv pygame if present
venv_py = ROOT / ".venv" / "bin" / "python"
if venv_py.is_file() and Path(sys.executable).resolve() != venv_py.resolve():
    # re-exec under venv when user calls system python
    if "pygame" not in sys.modules:
        try:
            import pygame  # noqa: F401
        except ImportError:
            os.execv(str(venv_py), [str(venv_py), str(Path(__file__).resolve()), *sys.argv[1:]])

from launcher.app.main import main

if __name__ == "__main__":
    raise SystemExit(main())
