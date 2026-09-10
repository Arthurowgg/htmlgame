#!/usr/bin/env python3
"""
Grand Pixel Game — Setup (CLI)

Windows users: prefer Launcher-Setup.exe (GUI, no terminal).
This script remains for Linux/macOS and developers.

  python setup/GPG_Setup.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# repo root on path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from setup.win_setup_core import (  # noqa: E402
    DEFAULT_BRANCH,
    default_install_dir,
    run_install,
    launch_installed,
)


def main() -> int:
    print("=" * 52)
    print("  GRAND PIXEL GAME — SETUP (CLI)")
    print("  Windows users: download Launcher-Setup.exe instead")
    print("=" * 52)
    dest = default_install_dir()
    res = run_install(
        install_to=dest,
        branch=DEFAULT_BRANCH,
        use_embed_python=(sys.platform == "win32"),
    )
    if not res.ok:
        print("\nFAILED:", res.error)
        return 1
    try:
        ans = input("Launch now? [Y/n] ").strip().lower()
    except EOFError:
        ans = "y"
    if ans in ("", "y", "yes") and res.root:
        print("Starting launcher…")
        try:
            launch_installed(res.root)
        except Exception as e:
            print("Could not auto-start:", e)
            print("Start manually from:", res.root)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(1)
