#!/usr/bin/env python3
"""
Build OmniClash-Setup.exe with PyInstaller (run on Windows).

Usage (from repo root, on Windows CI or a Windows machine):

    python -m pip install pyinstaller pillow pygame
    python setup/build_windows_setup.py

Output:
    launcher/dist/OmniClash-Setup.exe
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETUP = Path(__file__).resolve().parent
DIST = ROOT / "launcher" / "dist"
WORK = ROOT / "launcher" / "build_tmp" / "setup"
SPEC = WORK


def main() -> int:
    if sys.platform != "win32":
        print("WARNING: This script is meant to run on Windows.")
        print("On Linux/macOS it may still produce a non-.exe binary for smoke tests.")

    DIST.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    entry = SETUP / "win_setup_gui.py"
    if not entry.is_file():
        print(f"Missing entry: {entry}")
        return 1

    # Ensure setup is a package for hiddenimports
    name = "OmniClash-Setup"
    sep = ";" if sys.platform == "win32" else ":"

    # Include the whole setup package as data so frozen app can import it
    add_data = [
        "--add-data",
        f"{SETUP}{sep}setup",
    ]

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed" if sys.platform == "win32" else "--console",
        "--name",
        name,
        "--distpath",
        str(DIST),
        "--workpath",
        str(WORK / "work"),
        "--specpath",
        str(SPEC),
        "--paths",
        str(ROOT),
        "--hidden-import",
        "setup",
        "--hidden-import",
        "setup.win_setup_core",
        "--hidden-import",
        "setup.win_setup_gui",
        "--collect-all",
        "tkinter",
        *add_data,
        str(entry),
    ]
    print(" ".join(cmd))
    r = subprocess.call(cmd)
    if r != 0:
        return r

    # Normalize output name
    produced = DIST / (name + (".exe" if sys.platform == "win32" else ""))
    # PyInstaller may emit without extension on non-win
    if not produced.exists():
        # find anything matching
        cands = list(DIST.glob("OmniClash-Setup*"))
        if cands:
            produced = cands[0]

    if produced.exists():
        final = DIST / ("OmniClash-Setup.exe" if sys.platform == "win32" else "OmniClash-Setup")
        if produced.resolve() != final.resolve():
            if final.exists():
                final.unlink()
            produced.replace(final)
        print(f"OK -> {final} ({final.stat().st_size} bytes)")
        # write a small sha256 sidecar for release notes
        try:
            import hashlib
            h = hashlib.sha256(final.read_bytes()).hexdigest()
            (DIST / (final.name + ".sha256")).write_text(h + "  " + final.name + "\n", encoding="utf-8")
            print("SHA256", h)
        except Exception as e:
            print("sha256 skip", e)
        return 0

    print("Build finished but output file not found in", DIST)
    print(list(DIST.iterdir()))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
