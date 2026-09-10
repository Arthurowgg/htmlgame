#!/usr/bin/env python3
"""
Grand Pixel Game — one-click Setup
Downloads the launcher + game from GitHub and installs a desktop shortcut.
No need to clone the full repo.
"""
from __future__ import annotations
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import zipfile
import urllib.request
from pathlib import Path

REPO = "Arthurowgg/htmlgame"
BRANCH = "arena/01a08cbd-htmlgame"
# Prefer release tag zip of portable launcher; fall back to codeload branch
PORTABLE_NAME = "GrandPixelGameLauncher-v3.0.0-portable.zip"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"
CODELOAD = f"https://codeload.github.com/{REPO}/zip/refs/heads/{BRANCH}"
RELEASE_TAG = "launcher-v3.0.0"

APP_NAME = "GrandPixelGame"


def data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def install_dir() -> Path:
    return data_dir() / "install"


def log(msg: str):
    print(msg, flush=True)


def download(url: str, dest: Path, label: str = ""):
    log(f"  ↓ {label or url}")
    req = urllib.request.Request(url, headers={"User-Agent": "GPG-Setup/3.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        read = 0
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            out.write(chunk)
            read += len(chunk)
            if total:
                pct = int(read * 100 / total)
                print(f"\r  {pct:3d}%  {read // 1024} KB", end="", flush=True)
        print()


def try_download(urls, dest: Path) -> bool:
    for url in urls:
        try:
            download(url, dest, url.split("/")[-1])
            return True
        except Exception as e:
            log(f"  (skip) {e}")
    return False


def ensure_venv(root: Path) -> Path:
    venv = root / ".venv"
    py = venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    pip = venv / ("Scripts/pip.exe" if sys.platform == "win32" else "bin/pip")
    if not py.is_file():
        log("Creating virtual environment…")
        subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
    log("Installing pygame + pillow + pywebview…")
    subprocess.check_call([str(pip), "install", "-q", "--upgrade", "pip"])
    subprocess.check_call([str(pip), "install", "-q", "pygame", "pillow", "pywebview"])
    return py


def write_launcher_scripts(root: Path, py: Path):
    if sys.platform == "win32":
        bat = root / "Grand Pixel Game Launcher.bat"
        bat.write_text(
            f'@echo off\r\ncd /d "%~dp0"\r\n"{py}" launcher\\run.py %*\r\n'
            f'if errorlevel 1 pause\r\n',
            encoding="utf-8",
        )
        # optional powershell
        (root / "START.ps1").write_text(
            f'Set-Location $PSScriptRoot\n& "{py}" launcher\\run.py @args\n',
            encoding="utf-8",
        )
        log(f"Created {bat.name}")
    else:
        sh = root / "START.sh"
        sh.write_text(
            f"#!/usr/bin/env bash\ncd \"$(dirname \"$0\")\"\nexec \"{py}\" launcher/run.py \"$@\"\n",
            encoding="utf-8",
        )
        sh.chmod(0o755)
        log(f"Created {sh.name}")


def make_shortcut(root: Path, py: Path):
    try:
        if sys.platform == "win32":
            # .url / simple bat on Desktop
            desk = Path.home() / "Desktop"
            if not desk.is_dir():
                desk = Path.home() / "OneDrive" / "Desktop"
            target = desk / "Grand Pixel Game Launcher.bat"
            target.write_text(
                f'@echo off\r\ncd /d "{root}"\r\n"{py}" launcher\\run.py\r\n',
                encoding="utf-8",
            )
            log(f"Desktop shortcut → {target}")
        elif sys.platform == "darwin":
            apps = Path.home() / "Applications"
            apps.mkdir(exist_ok=True)
            # simple command file
            cmd = apps / "Grand Pixel Game Launcher.command"
            cmd.write_text(
                f"#!/bin/bash\ncd '{root}'\nexec '{py}' launcher/run.py\n",
                encoding="utf-8",
            )
            cmd.chmod(0o755)
            log(f"App command → {cmd}")
        else:
            apps = Path.home() / ".local" / "share" / "applications"
            apps.mkdir(parents=True, exist_ok=True)
            desk = apps / "grand-pixel-game.desktop"
            desk.write_text(
                "\n".join([
                    "[Desktop Entry]",
                    "Type=Application",
                    "Name=Grand Pixel Game Launcher",
                    "Comment=Pixel island RPG launcher",
                    f"Exec={py} {root / 'launcher' / 'run.py'}",
                    "Terminal=false",
                    "Categories=Game;",
                    "",
                ]),
                encoding="utf-8",
            )
            desk.chmod(0o755)
            log(f"Desktop entry → {desk}")
    except Exception as e:
        log(f"Shortcut skipped: {e}")


def extract_portable(zpath: Path, dest: Path):
    with zipfile.ZipFile(zpath, "r") as z:
        z.extractall(dest)
    # find folder containing launcher/run.py
    for p in dest.rglob("run.py"):
        if p.parent.name == "launcher":
            return p.parents[1]
    # or START.sh sibling
    for p in dest.rglob("START.sh"):
        return p.parent
    return dest


def extract_repo_subset(zpath: Path, dest: Path):
    """From full branch zip, keep only launcher/ + versions/ + needed bits."""
    tmp = dest / "_tmp_extract"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()
    with zipfile.ZipFile(zpath, "r") as z:
        z.extractall(tmp)
    # GitHub zip root is repo-branch/
    roots = [p for p in tmp.iterdir() if p.is_dir()]
    src = roots[0] if roots else tmp
    out = dest / "GrandPixelLauncher"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    for name in ("launcher", "versions", "game"):
        s = src / name
        if s.exists():
            shutil.copytree(s, out / name)
    # thin README
    (out / "README.txt").write_text(
        "Grand Pixel Game — installed by Setup\nRun START.sh / .bat\n",
        encoding="utf-8",
    )
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def main():
    log("=" * 52)
    log("  GRAND PIXEL GAME — SETUP")
    log("  Downloads launcher + game from GitHub")
    log("=" * 52)
    log(f"Platform: {platform.system()} {platform.machine()}")
    log(f"Install to: {install_dir()}")

    dest = install_dir()
    dest.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="gpg-setup-"))
    zpath = tmp / "pack.zip"

    # 1) try portable release asset via API
    urls = [
        f"https://github.com/{REPO}/releases/download/{RELEASE_TAG}/{PORTABLE_NAME}",
        # codeload of branch (always works)
        CODELOAD,
    ]
    # also try raw path of portable zip in tree
    urls.insert(1, f"https://github.com/{REPO}/raw/{BRANCH}/launcher/dist/{PORTABLE_NAME}")

    ok = try_download(urls, zpath)
    if not ok:
        log("ERROR: could not download package.")
        log("Check your internet connection and try again.")
        return 1

    log("Extracting…")
    # detect if portable or full repo
    with zipfile.ZipFile(zpath, "r") as z:
        names = z.namelist()[:20]
    is_full_repo = any("/launcher/app/" in n or n.endswith("launcher/run.py") for n in z.namelist())
    is_portable = any("GrandPixelLauncher" in n for n in z.namelist())

    if is_portable and not any(n.startswith(f"{REPO.replace('/', '-')}") or "-arena-" in n for n in names):
        root = extract_portable(zpath, dest)
    else:
        root = extract_repo_subset(zpath, dest)

    log(f"Installed files → {root}")

    # ensure versions exist; if only launcher, pull versions from raw
    ver = root / "versions" / "catalog.json"
    if not ver.is_file():
        log("Fetching version catalog…")
        (root / "versions").mkdir(exist_ok=True)
        try:
            download(f"{RAW_BASE}/versions/catalog.json", ver, "catalog.json")
        except Exception as e:
            log(f"catalog: {e}")

    py = ensure_venv(root)
    write_launcher_scripts(root, py)
    make_shortcut(root, py)

    # marker
    (data_dir() / "install_path.txt").write_text(str(root), encoding="utf-8")
    meta = {"repo": REPO, "branch": BRANCH, "root": str(root)}
    (data_dir() / "setup.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    log("")
    log("✓ Setup complete!")
    log(f"  Folder: {root}")
    if sys.platform == "win32":
        log('  Run: "Grand Pixel Game Launcher.bat"')
    else:
        log("  Run: ./START.sh")
    log("")
    # auto-start?
    try:
        ans = input("Launch now? [Y/n] ").strip().lower()
    except EOFError:
        ans = "y"
    if ans in ("", "y", "yes"):
        log("Starting launcher…")
        os.chdir(root)
        os.execv(str(py), [str(py), str(root / "launcher" / "run.py")])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(1)
