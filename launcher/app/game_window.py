"""Open the game in a dedicated native OS window.

Uses a short-lived child process so pywebview can own the main thread
while the pygame launcher keeps running.
"""
from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path

_proc = None


def open_game(url: str, title: str = "Lumina Isle") -> bool:
    global _proc
    close_game()

    # Child script — runs webview on ITS main thread
    code = r"""
import sys
url, title = sys.argv[1], sys.argv[2]
try:
    import webview
    webview.create_window(title, url, width=1280, height=800,
                          min_size=(960, 600), background_color="#070b14")
    webview.start()
except Exception as e:
    # Fallback: open default browser if webview backend missing
    import webbrowser
    print("webview failed:", e, flush=True)
    webbrowser.open(url)
"""
    try:
        _proc = subprocess.Popen(
            [sys.executable, "-c", code, url, title],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return True
    except Exception as e:
        print(f"[game_window] spawn failed: {e}", flush=True)
        return False


def close_game():
    global _proc
    if _proc and _proc.poll() is None:
        try:
            _proc.terminate()
        except Exception:
            pass
    _proc = None
