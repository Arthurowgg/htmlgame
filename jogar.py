#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GRAND PIXEL GAME — launcher (sem precisar de .exe).
Serve o jogo num servidor HTTP local e abre o navegador.

Uso:
    python3 jogar.py                 # porta 8137, abre o navegador
    python3 jogar.py --port 9000     # porta específica
    python3 jogar.py --noopen        # só imprime a URL

Requer Python 3.7+ (biblioteca padrão apenas — sem instalação).
"""

import http.server
import os
import socket
import sys
import threading
import webbrowser

try:
    import mimetypes
except Exception:
    mimetypes = None

ROOT = os.path.dirname(os.path.abspath(__file__))

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
}


class GPGHandler(http.server.BaseHTTPRequestHandler):
    server_version = "GrandPixelGame/1.0"
    protocol_version = "HTTP/1.1"

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Grand-Pixel-Game", "1")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        self._serve()

    def do_HEAD(self):
        self._serve()

    def _serve(self):
        raw = self.path.split("?")[0]
        try:
            from urllib.parse import unquote
            raw = unquote(raw)
        except Exception:
            pass
        p = raw
        if p.startswith("/"):
            p = p[1:]
        # segurança: bloqueia subida de diretório
        parts = []
        for seg in p.split("/"):
            if seg in ("", "."):
                continue
            if seg == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(seg)
        p = "/".join(parts)
        if p == "":
            p = "index.html"
        full = os.path.normpath(os.path.join(ROOT, p))
        if not full.startswith(os.path.abspath(ROOT)):
            self._send(403, b"fora dos limites", "text/plain; charset=utf-8")
            return
        try:
            with open(full, "rb") as f:
                data = f.read()
        except FileNotFoundError:
            self._send(404, b"404: arquivo nao encontrado no jogo.", "text/plain; charset=utf-8")
            return
        except IsADirectoryError:
            if p == "index.html":
                self._send(404, b"index.html ausente.", "text/plain; charset=utf-8")
            else:
                self._serve_url(p + "/index.html")
            return
        ext = os.path.splitext(p)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        self._send(200, data, ctype)

    def _serve_url(self, rel):
        # redireciona internamente (só diretórios)
        self.path = "/" + rel
        self._serve()

    def log_message(self, fmt, *args):
        pass  # silencioso


def find_port(base, tries=60):
    for port in range(base, base + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return None


def main():
    port = 8137
    noopen = False
    quiet = False
    i = 1
    while i < len(sys.argv):
        a = sys.argv[i]
        if a in ("--port", "-p"):
            i += 1
            port = int(sys.argv[i])
        elif a.startswith("--port="):
            port = int(a.split("=", 1)[1])
        elif a in ("--noopen",):
            noopen = True
        elif a in ("--quiet", "-q"):
            quiet = True
        i += 1
    if port <= 0:
        print("porta inválida")
        sys.exit(2)
    found = find_port(port)
    if found is None:
        print("Nao achei porta livre a partir de %d (muitos servidores?)" % port)
        sys.exit(1)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", found), GPGHandler)
    url = "http://127.0.0.1:%d/" % found
    if not quiet:
        line = "=" * 56
        print(line)
        print("  GRAND PIXEL GAME  —  rodando em  %s" % url)
        print(line)
        print("  Para fechar o jogo: feche esta janela ou pressione Ctrl+C.")
    else:
        print(url)
    if not noopen:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAte logo! Obrigado por jogar GRAND PIXEL GAME.")
        server.server_close()


if __name__ == "__main__":
    main()
