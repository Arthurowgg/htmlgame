#!/usr/bin/env python3
"""Grand Pixel Game Launcher — standalone pixel-art desktop app."""
from __future__ import annotations
import argparse
import os
import sys
from pathlib import Path

# Allow `python -m launcher.app.main` and frozen exe
if __name__ == "__main__" and not getattr(sys, "frozen", False):
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Grand Pixel Game Launcher")
    parser.add_argument("--scale", type=int, default=3, help="Pixel scale 2-5 (default 3)")
    parser.add_argument("--screenshot", action="store_true", help="Render tabs and quit (CI/preview)")
    parser.add_argument("--dummy", action="store_true", help="Force SDL dummy video driver")
    args = parser.parse_args(argv)

    if args.dummy or args.screenshot or os.environ.get("SDL_VIDEODRIVER") == "dummy":
        os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
        os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

    # HiDPI friendliness
    os.environ.setdefault("SDL_VIDEO_CENTERED", "1")

    from launcher.app.ui import LauncherApp
    app = LauncherApp(scale=args.scale, screenshot_mode=args.screenshot)
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
