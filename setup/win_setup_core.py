"""
Shared Windows install logic for Grand Pixel Game Launcher.

Used by:
  - setup/GPG_Setup.py  (cross-platform CLI)
  - setup/win_setup_gui.py  (GUI → packaged as Launcher-Setup.exe)

Does NOT change launcher gameplay logic. Only installs files + shortcuts.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

REPO = "Arthurowgg/htmlgame"
# Prefer the branch this session tracks; fall back to main/default on GitHub
DEFAULT_BRANCH = "arena/01a08cbd-htmlgame"
APP_NAME = "GrandPixelGame"
SETUP_UA = "GPG-Launcher-Setup/1.0"

# Embeddable CPython (no user-facing Python install required)
# Keep in sync with GitHub Actions matrix if bumped.
EMBED_PY_VERSION = "3.12.7"
EMBED_PY_URL = (
    f"https://www.python.org/ftp/python/{EMBED_PY_VERSION}/python-{EMBED_PY_VERSION}-embed-amd64.zip"
)
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"

LogFn = Callable[[str], None]
ProgFn = Callable[[float, str], None]  # 0..1, label


@dataclass
class InstallResult:
    ok: bool
    root: Optional[Path] = None
    launcher_exe: Optional[Path] = None
    error: str = ""
    log_lines: list[str] = field(default_factory=list)


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


def default_install_dir() -> Path:
    """Where the launcher app lives on disk (user-writable, no admin)."""
    if sys.platform == "win32":
        # Prefer LocalAppData\GrandPixelGame\Launcher (no UAC)
        return data_dir() / "Launcher"
    return data_dir() / "install" / "GrandPixelLauncher"


def _http_get(url: str, dest: Path, log: LogFn, prog: Optional[ProgFn] = None, label: str = ""):
    log(f"Downloading {label or url.split('/')[-1]}…")
    req = urllib.request.Request(url, headers={"User-Agent": SETUP_UA})
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        read = 0
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            out.write(chunk)
            read += len(chunk)
            if prog and total:
                prog(min(0.99, read / total), label or "download")


def _try_urls(urls: list[str], dest: Path, log: LogFn, prog: Optional[ProgFn] = None) -> str:
    last_err = ""
    for url in urls:
        try:
            _http_get(url, dest, log, prog, label=url.split("/")[-1][:60])
            return url
        except Exception as e:
            last_err = str(e)
            log(f"  skip: {e}")
    raise RuntimeError(last_err or "All download URLs failed")


def _github_api(path: str) -> dict | list:
    url = f"https://api.github.com/repos/{REPO}/{path}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": SETUP_UA,
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_package_urls(branch: str = DEFAULT_BRANCH) -> list[str]:
    """Build ordered list of URLs to fetch the launcher+versions package."""
    urls: list[str] = []
    # 1) Latest release assets named *portable*.zip or Launcher bundle
    try:
        releases = _github_api("releases?per_page=15")
        if isinstance(releases, list):
            for rel in releases:
                for asset in rel.get("assets") or []:
                    name = str(asset.get("name") or "")
                    if re.search(r"(portable|Launcher|launcher).*\.zip$", name, re.I) or name.endswith(
                        "portable.zip"
                    ):
                        u = asset.get("browser_download_url")
                        if u:
                            urls.append(u)
                # prefer launcher-v* tags first
                tag = str(rel.get("tag_name") or "")
                if tag.startswith("launcher-v"):
                    break
    except Exception:
        pass

    # 2) Branch zip from codeload (always works publicly)
    urls.append(f"https://codeload.github.com/{REPO}/zip/refs/heads/{branch}")
    # 3) main fallback
    if branch != "main":
        urls.append(f"https://codeload.github.com/{REPO}/zip/refs/heads/main")
    # 4) tree raw portable (if committed)
    urls.append(
        f"https://github.com/{REPO}/raw/{branch}/launcher/dist/GrandPixelGameLauncher-v3.1.0-portable.zip"
    )
    # de-dupe preserve order
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def extract_package(zpath: Path, dest: Path, log: LogFn) -> Path:
    """
    Extract zip into dest and return the app root that contains launcher/ + versions/.
    """
    tmp = dest / "_extract_tmp"
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)

    log("Extracting package…")
    with zipfile.ZipFile(zpath, "r") as z:
        z.extractall(tmp)

    # Case A: portable layout GrandPixelLauncher/{launcher,versions}
    for p in tmp.rglob("run.py"):
        if p.parent.name == "launcher":
            root = p.parents[1]
            final = dest / "app"
            if final.exists():
                shutil.rmtree(final, ignore_errors=True)
            shutil.copytree(root, final)
            shutil.rmtree(tmp, ignore_errors=True)
            return final

    # Case B: full repo zip → repo-branch/{launcher,versions,game}
    roots = [p for p in tmp.iterdir() if p.is_dir()]
    src = roots[0] if roots else tmp
    final = dest / "app"
    if final.exists():
        shutil.rmtree(final, ignore_errors=True)
    final.mkdir(parents=True)
    for name in ("launcher", "versions", "game"):
        s = src / name
        if s.exists():
            shutil.copytree(s, final / name)
    if not (final / "launcher").exists():
        shutil.rmtree(tmp, ignore_errors=True)
        raise RuntimeError("Package missing launcher/ folder")
    # ensure versions
    if not (final / "versions" / "catalog.json").is_file():
        (final / "versions").mkdir(exist_ok=True)
    shutil.rmtree(tmp, ignore_errors=True)
    return final


def _enable_embed_site(embed_dir: Path, log: LogFn):
    """Uncomment import site in python*._pth so pip/site-packages work."""
    pth_files = list(embed_dir.glob("python*._pth"))
    if not pth_files:
        log("Warning: no ._pth file in embed dist")
        return
    pth = pth_files[0]
    text = pth.read_text(encoding="utf-8", errors="ignore")
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") and "import site" in stripped:
            lines.append("import site")
        else:
            lines.append(line)
    if "import site" not in "\n".join(lines):
        lines.append("import site")
    # Ensure Lib\site-packages is searchable
    if "Lib\\site-packages" not in "\n".join(lines) and "Lib/site-packages" not in "\n".join(lines):
        lines.append("Lib\\site-packages")
    pth.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log(f"Enabled site-packages in {pth.name}")


def install_embedded_python(root: Path, log: LogFn, prog: Optional[ProgFn] = None) -> Path:
    """
    Install Windows embeddable CPython + pip + pygame/pillow/pywebview under root/runtime.
    Returns path to python.exe
    """
    runtime = root / "runtime"
    py_exe = runtime / "python.exe"
    if py_exe.is_file() and (runtime / "Lib" / "site-packages" / "pygame").exists():
        log("Embedded Python already present — reusing")
        return py_exe

    runtime.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="gpg-py-"))
    try:
        zpath = tmp / "embed.zip"
        _http_get(EMBED_PY_URL, zpath, log, prog, label=f"Python {EMBED_PY_VERSION} embed")
        log("Extracting Python runtime…")
        with zipfile.ZipFile(zpath, "r") as z:
            z.extractall(runtime)
        _enable_embed_site(runtime, log)

        get_pip = tmp / "get-pip.py"
        _http_get(GET_PIP_URL, get_pip, log, prog, label="get-pip.py")
        log("Installing pip…")
        subprocess.check_call(
            [str(py_exe), str(get_pip), "--no-warn-script-location"],
            cwd=str(runtime),
        )
        log("Installing pygame, pillow, pywebview…")
        # pip.exe may live in Scripts after get-pip
        pip_exe = runtime / "Scripts" / "pip.exe"
        if pip_exe.is_file():
            cmd = [str(pip_exe), "install", "--no-warn-script-location", "pygame", "pillow", "pywebview"]
        else:
            cmd = [str(py_exe), "-m", "pip", "install", "--no-warn-script-location", "pygame", "pillow", "pywebview"]
        subprocess.check_call(cmd, cwd=str(runtime))
        log("Python runtime ready")
        return py_exe
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def install_venv_python(root: Path, log: LogFn) -> Path:
    """Fallback when system Python exists (Linux/mac/dev)."""
    venv = root / ".venv"
    if sys.platform == "win32":
        py = venv / "Scripts" / "python.exe"
        pip = venv / "Scripts" / "pip.exe"
    else:
        py = venv / "bin" / "python"
        pip = venv / "bin" / "pip"
    if not py.is_file():
        log("Creating virtual environment…")
        subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
    log("Installing pygame, pillow, pywebview…")
    subprocess.check_call([str(pip), "install", "-q", "--upgrade", "pip"])
    subprocess.check_call([str(pip), "install", "-q", "pygame", "pillow", "pywebview"])
    return py


def write_windows_launchers(root: Path, py: Path, log: LogFn) -> Path:
    """Create Start.bat and Desktop/Start Menu shortcuts. Returns Start.bat path."""
    bat = root / "Start Launcher.bat"
    bat.write_text(
        "\r\n".join(
            [
                "@echo off",
                "setlocal",
                'cd /d "%~dp0"',
                f'"{py}" -u launcher\\run.py %*',
                "set ERR=%ERRORLEVEL%",
                "if not %ERR%==0 (",
                "  echo.",
                "  echo Launcher exited with error %ERR%.",
                "  pause",
                ")",
                "endlocal",
                "",
            ]
        ),
        encoding="utf-8",
    )
    log(f"Created {bat.name}")

    # Uninstall helper (optional)
    un = root / "Uninstall.bat"
    un.write_text(
        "\r\n".join(
            [
                "@echo off",
                "echo This removes the Grand Pixel Game Launcher install folder.",
                "echo Game saves in %LOCALAPPDATA%\\GrandPixelGame are kept.",
                "pause",
                'cd /d "%~dp0"',
                "cd ..",
                f'rmdir /s /q "{root.name}" 2>nul',
                "echo Done.",
                "pause",
                "",
            ]
        ),
        encoding="utf-8",
    )

    # Desktop shortcut (.bat is double-clickable; also try .lnk via PowerShell)
    try:
        desk = Path.home() / "Desktop"
        if not desk.is_dir():
            desk = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"
        if not desk.is_dir():
            desk = Path.home() / "OneDrive" / "Desktop"
        if desk.is_dir():
            target = desk / "Grand Pixel Game Launcher.bat"
            target.write_text(
                f'@echo off\r\ncd /d "{root}"\r\n"{py}" -u launcher\\run.py\r\nif errorlevel 1 pause\r\n',
                encoding="utf-8",
            )
            log(f"Desktop shortcut → {target}")
            # Real .lnk
            _make_lnk(
                desk / "Grand Pixel Game Launcher.lnk",
                str(py),
                f'"{root / "launcher" / "run.py"}"',
                str(root),
                log,
            )
    except Exception as e:
        log(f"Desktop shortcut skipped: {e}")

    # Start Menu
    try:
        sm = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Grand Pixel Game"
        sm.mkdir(parents=True, exist_ok=True)
        _make_lnk(
            sm / "Grand Pixel Game Launcher.lnk",
            str(py),
            f'"{root / "launcher" / "run.py"}"',
            str(root),
            log,
        )
        # copy bat too
        shutil.copy2(bat, sm / "Start Launcher.bat")
        log(f"Start Menu → {sm}")
    except Exception as e:
        log(f"Start Menu skipped: {e}")

    return bat


def _make_lnk(lnk_path: Path, target: str, args: str, workdir: str, log: LogFn):
    """Create a Windows .lnk via PowerShell (no extra deps)."""
    if sys.platform != "win32":
        return
    ps = f"""
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('{str(lnk_path).replace("'", "''")}')
$s.TargetPath = '{target.replace("'", "''")}'
$s.Arguments = '{args.replace("'", "''")}'
$s.WorkingDirectory = '{workdir.replace("'", "''")}'
$s.WindowStyle = 1
$s.Description = 'Grand Pixel Game Launcher'
$s.Save()
"""
    try:
        subprocess.check_call(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log(f"Created shortcut {lnk_path.name}")
    except Exception as e:
        log(f".lnk failed ({e}) — bat shortcut still works")


def write_install_meta(root: Path, py: Path):
    d = data_dir()
    (d / "install_path.txt").write_text(str(root), encoding="utf-8")
    meta = {
        "repo": REPO,
        "root": str(root),
        "python": str(py),
        "installedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "setupVersion": "1.0.0",
    }
    (d / "setup.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (root / "INSTALL_INFO.txt").write_text(
        "\n".join(
            [
                "Grand Pixel Game Launcher",
                f"Install folder: {root}",
                f"Python: {py}",
                "",
                "Start:  double-click  Start Launcher.bat",
                "   or:  Desktop / Start Menu shortcut",
                "",
                "Game saves & installs live in %LOCALAPPDATA%\\GrandPixelGame\\",
                "",
            ]
        ),
        encoding="utf-8",
    )


def run_install(
    *,
    install_to: Optional[Path] = None,
    branch: str = DEFAULT_BRANCH,
    log: Optional[LogFn] = None,
    prog: Optional[ProgFn] = None,
    use_embed_python: bool = True,
) -> InstallResult:
    """
    Full install pipeline:
      download package → extract → install Python runtime → shortcuts → meta
    """
    lines: list[str] = []

    def _log(m: str):
        lines.append(m)
        if log:
            log(m)
        else:
            print(m, flush=True)

    def _prog(v: float, label: str):
        if prog:
            prog(v, label)

    try:
        dest_parent = install_to or default_install_dir()
        dest_parent.mkdir(parents=True, exist_ok=True)
        _log("=" * 48)
        _log("  GRAND PIXEL GAME — LAUNCHER SETUP")
        _log("=" * 48)
        _log(f"Install folder: {dest_parent}")
        _prog(0.02, "Starting")

        tmp = Path(tempfile.mkdtemp(prefix="gpg-setup-"))
        zpath = tmp / "pack.zip"
        try:
            urls = resolve_package_urls(branch)
            _log(f"Package sources: {len(urls)}")
            _prog(0.05, "Downloading launcher package")

            def dl_prog(v, label):
                _prog(0.05 + v * 0.35, label)

            _try_urls(urls, zpath, _log, dl_prog)
            _prog(0.42, "Extracting")
            root = extract_package(zpath, dest_parent, _log)
            _log(f"App root: {root}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        if not (root / "versions" / "catalog.json").is_file():
            _log("Fetching version catalog…")
            (root / "versions").mkdir(exist_ok=True)
            try:
                _http_get(
                    f"https://raw.githubusercontent.com/{REPO}/{branch}/versions/catalog.json",
                    root / "versions" / "catalog.json",
                    _log,
                )
            except Exception as e:
                _log(f"catalog warning: {e}")

        _prog(0.55, "Installing Python runtime")
        if sys.platform == "win32" and use_embed_python:
            try:
                py = install_embedded_python(root, _log, lambda v, l: _prog(0.55 + v * 0.30, l))
            except Exception as e:
                _log(f"Embed Python failed ({e}); trying system Python…")
                if not sys.executable:
                    raise
                py = install_venv_python(root, _log)
        else:
            py = install_venv_python(root, _log)

        _prog(0.88, "Creating shortcuts")
        if sys.platform == "win32":
            write_windows_launchers(root, py, _log)
        else:
            # non-windows: keep simple start script
            sh = root / "START.sh"
            sh.write_text(
                f"#!/usr/bin/env bash\ncd \"$(dirname \"$0\")\"\nexec \"{py}\" launcher/run.py \"$@\"\n",
                encoding="utf-8",
            )
            sh.chmod(0o755)

        write_install_meta(root, py)
        _prog(1.0, "Done")
        _log("")
        _log("Setup complete!")
        _log(f"  Folder: {root}")
        _log('  Start:  "Start Launcher.bat" or Desktop shortcut')
        return InstallResult(ok=True, root=root, launcher_exe=None, log_lines=lines)
    except Exception as e:
        _log(f"ERROR: {e}")
        return InstallResult(ok=False, error=str(e), log_lines=lines)


def launch_installed(root: Path) -> int:
    """Start the launcher after install."""
    meta = data_dir() / "setup.json"
    py = None
    if meta.is_file():
        try:
            py = Path(json.loads(meta.read_text(encoding="utf-8")).get("python") or "")
        except Exception:
            pass
    if not py or not py.is_file():
        if sys.platform == "win32":
            cand = root / "runtime" / "python.exe"
            if cand.is_file():
                py = cand
            else:
                py = root / ".venv" / "Scripts" / "python.exe"
        else:
            py = root / ".venv" / "bin" / "python"
    run_py = root / "launcher" / "run.py"
    if not run_py.is_file():
        raise FileNotFoundError(f"Missing {run_py}")
    # Detach on Windows so setup GUI can close
    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        kwargs["stdout"] = subprocess.DEVNULL
        kwargs["stderr"] = subprocess.DEVNULL
        kwargs["stdin"] = subprocess.DEVNULL
    subprocess.Popen([str(py), "-u", str(run_py)], cwd=str(root), **kwargs)
    return 0
