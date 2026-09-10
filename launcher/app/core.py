"""Catalog, installs, play — pure logic, no pygame."""
from __future__ import annotations
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable, Optional

APP_NAME = "GrandPixelGame"
LAUNCHER_VERSION = "3.0.0"


def app_data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    (d / "versions").mkdir(exist_ok=True)
    return d


def find_repo_root() -> Optional[Path]:
    """Locate repo root that contains versions/catalog.json (dev + frozen)."""
    candidates = []
    # next to the launcher package: htmlgame/launcher/app -> htmlgame
    here = Path(__file__).resolve()
    candidates.append(here.parents[2])  # .../htmlgame
    candidates.append(here.parents[1])  # .../launcher
    # frozen / shipped next to exe
    if getattr(sys, "frozen", False):
        candidates.insert(0, Path(sys.executable).resolve().parent)
        candidates.insert(0, Path(sys.executable).resolve().parent / "data")
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.insert(0, Path(meipass))
    # cwd
    candidates.append(Path.cwd())
    candidates.append(Path.cwd().parent)
    for c in candidates:
        if (c / "versions" / "catalog.json").is_file():
            return c
        if (c / "catalog.json").is_file() and (c / "2.0.0").is_dir():
            return c
    return None


@dataclass
class Version:
    id: str
    version: str
    name: str
    type: str = "release"       # release | snapshot
    date: str = ""
    path: str = ""              # relative to repo root, e.g. versions/2.0.0/
    size: int = 0
    changelog: list = field(default_factory=list)
    latest: bool = False
    zip_url: Optional[str] = None
    source: str = "local"

    @property
    def label(self) -> str:
        tag = "REL" if self.type == "release" else "SNAP"
        extra = " *" if self.latest else ""
        return f"{self.version}  [{tag}]{extra}"


@dataclass
class Profile:
    name: str = "Player"
    color: str = "#5a9e6f"   # hex
    scale: str = "2"
    difficulty: str = "normal"
    sound: bool = True
    anim: bool = True
    auto_latest: bool = True


@dataclass
class Stats:
    launches: int = 0
    installs: int = 0


class LauncherCore:
    def __init__(self, log: Optional[Callable[[str], None]] = None):
        self.log = log or (lambda m: None)
        self.data = app_data_dir()
        self.repo = find_repo_root()
        self.catalog: list[Version] = []
        self.selected: Optional[Version] = None
        self.profile = self._load_json("profile.json", Profile())
        self.stats = self._load_json("stats.json", Stats())
        self._install_lock = threading.Lock()
        self.installing = False
        self.progress = 0.0
        self.progress_label = ""
        self.progress_detail = ""
        self.last_error = ""
        self.play_proc: Optional[subprocess.Popen] = None
        self._http = None  # BackgroundHTTP | None

    # ----- persistence -----
    def _load_json(self, name, default):
        p = self.data / name
        try:
            if p.is_file():
                raw = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(default, Profile):
                    return Profile(**{**asdict(default), **{k: raw[k] for k in asdict(default) if k in raw}})
                if isinstance(default, Stats):
                    return Stats(**{**asdict(default), **{k: raw[k] for k in asdict(default) if k in raw}})
        except Exception as e:
            self.log(f"load {name}: {e}")
        return default

    def save_profile(self):
        (self.data / "profile.json").write_text(json.dumps(asdict(self.profile), indent=2), encoding="utf-8")

    def save_stats(self):
        (self.data / "stats.json").write_text(json.dumps(asdict(self.stats), indent=2), encoding="utf-8")

    # ----- catalog -----
    def refresh_catalog(self) -> list[Version]:
        versions: dict[str, Version] = {}
        # local catalog
        cat_path = None
        if self.repo:
            cat_path = self.repo / "versions" / "catalog.json"
            if not cat_path.is_file():
                cat_path = self.repo / "catalog.json"
        if cat_path and cat_path.is_file():
            try:
                data = json.loads(cat_path.read_text(encoding="utf-8"))
                for v in data.get("versions", []):
                    ver = Version(
                        id=v.get("id") or f"game-v{v['version']}",
                        version=str(v["version"]),
                        name=v.get("name") or f"Grand Pixel Game {v['version']}",
                        type=v.get("type") or "release",
                        date=v.get("date") or "",
                        path=v.get("path") or f"versions/{v['version']}/",
                        size=int(v.get("size") or 0),
                        changelog=list(v.get("changelog") or []),
                        latest=bool(v.get("latest")),
                        source="local",
                    )
                    versions[ver.id] = ver
                self.log(f"Local catalog: {len(versions)} version(s)")
            except Exception as e:
                self.log(f"catalog parse: {e}")

        # scan versions/ folders even without catalog
        if self.repo:
            vdir = self.repo / "versions"
            if vdir.is_dir():
                for child in vdir.iterdir():
                    if child.is_dir() and (child / "index.html").is_file():
                        vid = f"game-v{child.name}"
                        if vid not in versions:
                            versions[vid] = Version(
                                id=vid, version=child.name,
                                name=f"Grand Pixel Game {child.name}",
                                path=f"versions/{child.name}/",
                                type="release", source="scan",
                            )

        # optional GitHub enrich
        try:
            req = urllib.request.Request(
                "https://api.github.com/repos/Arthurowgg/htmlgame/releases?per_page=30",
                headers={"Accept": "application/vnd.github+json", "User-Agent": "GPG-Launcher/3.0"},
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                releases = json.loads(resp.read().decode("utf-8"))
            for rel in releases:
                tag = rel.get("tag_name") or ""
                if not re.match(r"^game-v", tag, re.I):
                    continue
                ver_s = re.sub(r"^game-v", "", tag, flags=re.I)
                assets = rel.get("assets") or []
                zip_url = None
                size = 0
                for a in assets:
                    if str(a.get("name", "")).endswith(".zip"):
                        zip_url = a.get("browser_download_url")
                        size = int(a.get("size") or 0)
                        break
                vid = tag
                if vid in versions:
                    if zip_url:
                        versions[vid].zip_url = zip_url
                    if size:
                        versions[vid].size = size
                else:
                    versions[vid] = Version(
                        id=vid, version=ver_s,
                        name=rel.get("name") or f"Grand Pixel Game {ver_s}",
                        type="snapshot" if rel.get("prerelease") else "release",
                        date=rel.get("published_at") or "",
                        path=f"versions/{ver_s}/",
                        size=size, zip_url=zip_url, source="github",
                        changelog=[ln.lstrip("-* ") for ln in (rel.get("body") or "").splitlines() if ln.strip()][:6],
                    )
            self.log("GitHub catalog merged")
        except Exception as e:
            self.log(f"GitHub offline: {e}")

        def semver_key(v: Version):
            parts = []
            for p in v.version.split("."):
                try:
                    parts.append(int(p))
                except ValueError:
                    parts.append(0)
            return parts

        lst = sorted(versions.values(), key=semver_key, reverse=True)
        # ensure one latest
        if lst and not any(v.latest for v in lst):
            for v in lst:
                if v.type == "release":
                    v.latest = True
                    break
            else:
                lst[0].latest = True
        self.catalog = lst
        if self.catalog:
            if self.profile.auto_latest:
                self.selected = next((v for v in self.catalog if v.latest), self.catalog[0])
            elif not self.selected or self.selected.id not in {v.id for v in self.catalog}:
                self.selected = self.catalog[0]
        return self.catalog

    # ----- install state -----
    def install_dir(self, ver: Version) -> Path:
        return self.data / "versions" / ver.version

    def is_installed(self, ver: Version) -> bool:
        d = self.install_dir(ver)
        return (d / "index.html").is_file()

    def installed_size(self, ver: Version) -> int:
        d = self.install_dir(ver)
        if not d.is_dir():
            return 0
        total = 0
        for root, _, files in os.walk(d):
            for f in files:
                try:
                    total += (Path(root) / f).stat().st_size
                except OSError:
                    pass
        return total

    def list_installed(self) -> list[str]:
        vd = self.data / "versions"
        if not vd.is_dir():
            return []
        return sorted([p.name for p in vd.iterdir() if p.is_dir() and (p / "index.html").is_file()])

    # ----- install -----
    def install(self, ver: Version, on_done: Optional[Callable[[bool, str], None]] = None):
        if self.installing:
            return
        t = threading.Thread(target=self._install_worker, args=(ver, on_done), daemon=True)
        t.start()

    def _install_worker(self, ver: Version, on_done):
        with self._install_lock:
            self.installing = True
            self.progress = 0.0
            self.progress_label = f"Installing {ver.version}"
            self.progress_detail = ""
            self.last_error = ""
            ok = False
            err = ""
            try:
                dest = self.install_dir(ver)
                if dest.exists():
                    shutil.rmtree(dest)
                dest.mkdir(parents=True)

                # Prefer local copy from repo
                src = None
                if self.repo and ver.path:
                    cand = self.repo / ver.path
                    if (cand / "index.html").is_file():
                        src = cand
                    elif (self.repo / "versions" / ver.version / "index.html").is_file():
                        src = self.repo / "versions" / ver.version

                if src:
                    files = []
                    for root, _, fs in os.walk(src):
                        for f in fs:
                            files.append(Path(root) / f)
                    n = max(1, len(files))
                    for i, f in enumerate(files):
                        rel = f.relative_to(src)
                        target = dest / rel
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(f, target)
                        self.progress = (i + 1) / n * 0.95
                        self.progress_detail = str(rel)
                        time.sleep(0.01)  # let UI breathe + feel like install
                    ok = True
                elif ver.zip_url:
                    self.progress_detail = "Downloading…"
                    zpath = self.data / f"tmp-{ver.version}.zip"
                    self._download(ver.zip_url, zpath, lambda p: setattr(self, "progress", p * 0.8))
                    self.progress_detail = "Extracting…"
                    shutil.unpack_archive(str(zpath), str(dest))
                    zpath.unlink(missing_ok=True)
                    # if zip had a web/ root, flatten
                    web = dest / "web"
                    if web.is_dir() and not (dest / "index.html").is_file():
                        for child in web.iterdir():
                            shutil.move(str(child), str(dest / child.name))
                        web.rmdir()
                    ok = (dest / "index.html").is_file()
                    self.progress = 0.95
                else:
                    raise RuntimeError("No local files and no download URL for this version")

                # write install meta
                meta = {
                    "id": ver.id, "version": ver.version, "name": ver.name,
                    "installedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                (dest / "install.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
                self.progress = 1.0
                self.progress_detail = "Done"
                self.stats.installs += 1
                self.save_stats()
                self.log(f"Installed {ver.version} → {dest}")
            except Exception as e:
                err = str(e)
                self.last_error = err
                self.log(f"Install failed: {e}")
                ok = False
            finally:
                self.installing = False
                if on_done:
                    on_done(ok, err)

    def _download(self, url: str, dest: Path, on_prog: Callable[[float], None]):
        req = urllib.request.Request(url, headers={"User-Agent": "GPG-Launcher/3.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
            total = int(resp.headers.get("Content-Length") or 0)
            read = 0
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                read += len(chunk)
                if total:
                    on_prog(read / total)

    def uninstall(self, ver: Version):
        d = self.install_dir(ver)
        if d.is_dir():
            shutil.rmtree(d, ignore_errors=True)
            self.log(f"Uninstalled {ver.version}")

    def clear_all_installs(self):
        vd = self.data / "versions"
        if vd.is_dir():
            shutil.rmtree(vd, ignore_errors=True)
            vd.mkdir(parents=True, exist_ok=True)

    # ----- play -----
    def play(self, ver: Version) -> tuple[bool, str]:
        """Install if needed, start local static server, open game in browser (app-like)."""
        if not self.is_installed(ver):
            return False, "not-installed"
        root = self.install_dir(ver)
        # stop previous
        self.stop_play()
        try:
            from .http_server import GameServer
            cfg = {
                "playerName": self.profile.name,
                "playerColor": self.profile.color,
                "scale": int(self.profile.scale or 2),
                "difficulty": self.profile.difficulty,
                "version": ver.version,
                "launcher": LAUNCHER_VERSION,
            }
            self._http = GameServer(root, cfg)
            url = self._http.start()
            # Prefer opening with system browser; try chromium app mode
            opened = self._open_game_window(url)
            if not opened:
                webbrowser.open(url)
            self.stats.launches += 1
            self.save_stats()
            self.log(f"Playing {ver.version} @ {url}")
            return True, url
        except Exception as e:
            self.last_error = str(e)
            self.log(f"Play failed: {e}")
            return False, str(e)

    def _open_game_window(self, url: str) -> bool:
        """Try to open a dedicated app-like window (Chrome/Edge/Chromium --app)."""
        candidates = []
        if sys.platform == "win32":
            pf = os.environ.get("PROGRAMFILES", r"C:\Program Files")
            pf86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
            local = os.environ.get("LOCALAPPDATA", "")
            candidates = [
                shutil.which("chrome"),
                shutil.which("msedge"),
                f"{pf}/Google/Chrome/Application/chrome.exe",
                f"{pf86}/Google/Chrome/Application/chrome.exe",
                f"{local}/Google/Chrome/Application/chrome.exe",
                f"{pf}/Microsoft/Edge/Application/msedge.exe",
                f"{pf86}/Microsoft/Edge/Application/msedge.exe",
            ]
        elif sys.platform == "darwin":
            candidates = [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ]
        else:
            candidates = [
                shutil.which("google-chrome"),
                shutil.which("google-chrome-stable"),
                shutil.which("chromium"),
                shutil.which("chromium-browser"),
                shutil.which("microsoft-edge"),
                shutil.which("brave-browser"),
            ]
        for c in candidates:
            if not c or not Path(c).exists() and not shutil.which(str(c)):
                # which already returned path; Path may fail for bare name
                exe = shutil.which(str(c)) if c and not Path(str(c)).is_file() else c
            else:
                exe = c
            if not exe:
                continue
            try:
                self.play_proc = subprocess.Popen(
                    [str(exe), f"--app={url}", "--new-window",
                     f"--user-data-dir={self.data / 'browser-profile'}"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                return True
            except Exception:
                continue
        return False

    def stop_play(self):
        if self._http:
            try:
                self._http.stop()
            except Exception:
                pass
            self._http = None
        if self.play_proc and self.play_proc.poll() is None:
            try:
                self.play_proc.terminate()
            except Exception:
                pass
        self.play_proc = None

    def total_library_size(self) -> int:
        return sum(self.installed_size(v) for v in self.catalog if self.is_installed(v))
