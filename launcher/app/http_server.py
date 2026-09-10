"""Tiny local static server for an installed game version."""
from __future__ import annotations
import json
import socket
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs


class _Handler(SimpleHTTPRequestHandler):
    # set by factory
    game_root: Path = Path(".")
    launcher_cfg: dict = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(self.game_root), **kwargs)

    def log_message(self, fmt, *args):
        pass  # quiet

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        # inject config into index.html
        if parsed.path in ("/", "/index.html"):
            index = self.game_root / "index.html"
            if index.is_file():
                html = index.read_text(encoding="utf-8")
                cfg = dict(self.launcher_cfg)
                # merge query gpg if any
                qs = parse_qs(parsed.query)
                if "gpg" in qs:
                    try:
                        cfg.update(json.loads(qs["gpg"][0]))
                    except Exception:
                        pass
                inject = f"<script>window.__GPG__={json.dumps(cfg)};</script>"
                if "<head>" in html:
                    html = html.replace("<head>", "<head>" + inject, 1)
                else:
                    html = inject + html
                data = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        return super().do_GET()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class GameServer:
    def __init__(self, root: Path, cfg: dict):
        self.root = Path(root)
        self.cfg = cfg
        self.port = 0
        self._httpd = None
        self._thread = None

    def start(self) -> str:
        self.port = _free_port()

        class H(_Handler):
            game_root = self.root
            launcher_cfg = self.cfg

        self._httpd = ThreadingHTTPServer(("127.0.0.1", self.port), H)
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        return f"http://127.0.0.1:{self.port}/"

    def stop(self):
        if self._httpd:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None
