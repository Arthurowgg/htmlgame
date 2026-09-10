#!/usr/bin/env python3
"""Pack game/ into versions/<ver>/ and update catalog.json"""
from __future__ import annotations
import argparse, json, os, shutil, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
VERSIONS = ROOT / "versions"


def pack(ver: str, typ: str, notes: list[str], latest: bool | None):
    dest = VERSIONS / ver
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    # copy tree (html/css/js/assets)
    for sub in ("css", "js", "assets"):
        src = GAME / sub
        if src.exists():
            shutil.copytree(src, dest / sub, dirs_exist_ok=True)
    shutil.copy2(GAME / "index.html", dest / "index.html")

    files = []
    for dirpath, _, fnames in os.walk(dest):
        for f in fnames:
            if f == "manifest.json":
                continue
            rel = str(Path(dirpath, f).relative_to(dest)).replace("\\", "/")
            files.append(rel)
    files.sort()

    # stamp version into main.js fallback
    main = dest / "js" / "main.js"
    if main.exists():
        text = main.read_text(encoding="utf-8")
        import re
        text, n = re.subn(
            r"\|\|\s*'[^']*'",
            f"|| '{ver}'",
            text,
            count=1,
        )
        main.write_text(text, encoding="utf-8")

    manifest = {
        "id": f"game-v{ver}",
        "version": ver,
        "name": f"Grand Pixel Game {ver}",
        "entry": "index.html",
        "files": files,
        "type": typ,
    }
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    size = sum((dest / f).stat().st_size for f in files)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    cat_path = VERSIONS / "catalog.json"
    if cat_path.exists():
        catalog = json.loads(cat_path.read_text(encoding="utf-8"))
    else:
        catalog = {"launcher": "2.0.0", "versions": []}

    versions = [v for v in catalog.get("versions", []) if v.get("version") != ver]
    entry = {
        "id": f"game-v{ver}",
        "version": ver,
        "name": f"Grand Pixel Game {ver}",
        "type": typ,
        "date": now,
        "path": f"versions/{ver}/",
        "size": size,
        "changelog": notes or [f"Grand Pixel Game {ver}"],
        "latest": False,
    }
    versions.append(entry)

    # sort desc semver-ish
    def key(v):
        parts = []
        for p in str(v.get("version", "0")).split("."):
            try: parts.append(int(p))
            except: parts.append(0)
        return parts
    versions.sort(key=key, reverse=True)

    if latest is None:
        latest = typ == "release"
    if latest:
        # mark this as latest among releases
        for v in versions:
            v["latest"] = False
        # latest release (not snapshot) preferred
        for v in versions:
            if v.get("type") == "release":
                v["latest"] = True
                break
        else:
            if versions:
                versions[0]["latest"] = True
    else:
        # keep existing latest flags; ensure one exists
        if not any(v.get("latest") for v in versions) and versions:
            for v in versions:
                if v.get("type") == "release":
                    v["latest"] = True
                    break

    catalog["versions"] = versions
    catalog["updated"] = now
    cat_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Packed {ver} → {dest} ({size} bytes, {len(files)} files)")
    print(f"Updated {cat_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("version", help="e.g. 2.1.0")
    ap.add_argument("--type", choices=["release", "snapshot"], default="release")
    ap.add_argument("--notes", action="append", default=[])
    ap.add_argument("--latest", action="store_true", default=None)
    ap.add_argument("--not-latest", action="store_true")
    args = ap.parse_args()
    latest = True if args.latest else (False if args.not_latest else None)
    pack(args.version, args.type, args.notes, latest)


if __name__ == "__main__":
    main()
