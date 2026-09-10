#!/usr/bin/env python3
"""Build a standalone executable with PyInstaller."""
from __future__ import annotations
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = Path(__file__).resolve().parent
DIST = LAUNCHER / "dist"
SPEC_DIR = LAUNCHER / "build_tmp"


def main():
    py = ROOT / ".venv" / "bin" / "pyinstaller"
    if not py.is_file():
        py = Path(sys.executable).parent / "pyinstaller"
    if not py.is_file():
        print("pyinstaller not found — pip install pyinstaller")
        return 1

    DIST.mkdir(exist_ok=True)
    if SPEC_DIR.exists():
        shutil.rmtree(SPEC_DIR, ignore_errors=True)
    SPEC_DIR.mkdir()

    entry = LAUNCHER / "run.py"
    # Bundle versions/ next to the app as data
    versions = ROOT / "versions"
    sep = ";" if sys.platform == "win32" else ":"
    add_data = []
    if versions.is_dir():
        add_data += ["--add-data", f"{versions}{sep}versions"]

    cmd = [
        str(py),
        "--noconfirm",
        "--clean",
        "--name", "GrandPixelGameLauncher",
        "--onefile",
        "--windowed",
        "--distpath", str(DIST),
        "--workpath", str(SPEC_DIR / "work"),
        "--specpath", str(SPEC_DIR),
        *add_data,
        str(entry),
    ]
    print(" ".join(cmd))
    r = subprocess.call(cmd)
    if r == 0:
        print(f"OK → {DIST}")
        # also copy versions beside onefile for runtime find_repo_root
        side = DIST / "versions"
        if versions.is_dir():
            if side.exists():
                shutil.rmtree(side)
            shutil.copytree(versions, side, ignore=shutil.ignore_patterns("*.zip"))
            print(f"Copied versions → {side}")
    return r


if __name__ == "__main__":
    raise SystemExit(main())
