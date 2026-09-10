#!/usr/bin/env python3
"""Empacota o conteúdo do jogo para o launcher baixar.

    python3 game/tools/pack.py             # usa a versão de js/main.js
    python3 game/tools/pack.py --version 1.2.0

Gera game/dist/GrandPixelGame-vX.Y.Z-web.zip com o jogo na raiz do zip
(index.html no topo), sem compressão — é o formato que o launcher instala.
O zip é versionado no repositório porque o launcher o busca pela árvore da
tag da release, em:
  .../raw/refs/tags/game-vX.Y.Z/game/dist/GrandPixelGame-vX.Y.Z-web.zip
"""
import argparse
import hashlib
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ROOT = os.path.dirname(GAME)
DIST = os.path.join(GAME, 'dist')

# o que entra no pacote: tudo o que o jogo precisa para rodar
INCLUDE = ['index.html', 'css', 'js', 'assets']
IGNORE_DIRS = {'tests', 'tools', 'dist', 'node_modules', '__pycache__'}
IGNORE_EXT = {'.zip', '.md', '.pyc'}


def version_of():
    src = open(os.path.join(GAME, 'js', 'main.js'), encoding='utf-8').read()
    m = re.search(r"const VERSION = '([\d.]+)'", src)
    if not m:
        sys.exit('não achei a versão em js/main.js')
    return m.group(1)


def collect():
    out = []
    for item in INCLUDE:
        full = os.path.join(GAME, item)
        if os.path.isfile(full):
            out.append((item, full))
            continue
        for base, dirs, files in os.walk(full):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            for f in sorted(files):
                if os.path.splitext(f)[1] in IGNORE_EXT:
                    continue
                fullf = os.path.join(base, f)
                rel = os.path.relpath(fullf, GAME).replace('\\', '/')
                out.append((rel, fullf))
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default=None)
    args = ap.parse_args()
    version = args.version or version_of()
    main_ver = version_of()
    if args.version and args.version != main_ver:
        sys.exit('js/main.js diz %s, mas o pacote pediu %s — ajuste o VERSION primeiro'
                 % (main_ver, args.version))
    os.makedirs(DIST, exist_ok=True)
    files = collect()
    if not any(rel == 'index.html' for rel, _ in files):
        sys.exit('index.html não encontrado — o pacote precisa dele na raiz')

    name = 'GrandPixelGame-v%s-web.zip' % version
    out = os.path.join(DIST, name)
    total = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as z:
        for rel, full in files:
            with open(full, 'rb') as f:
                data = f.read()
            total += len(data)
            # data fixa deixa o pacote reprodutível (mesmo conteúdo = mesmo zip)
            info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)

    size = os.path.getsize(out)
    sha = hashlib.sha256(open(out, 'rb').read()).hexdigest()
    manifest = {
        'tag': 'game-v%s' % version,
        'version': version,
        'asset': name,
        'files': len(files),
        'bytes': size,
        'sha256': sha,
    }
    with open(os.path.join(DIST, 'last-build.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print('== conteúdo do Grand Pixel Game v%s ==' % version)
    print('  arquivos: %d  (%s de conteúdo)' % (len(files), fmt_kb(total)))
    print('  pacote:   game/dist/%s  (%s)' % (name, fmt_kb(size)))
    print('  sha256:   %s' % sha)
    print('  próximo passo: commitar o zip e criar a release game-v%s' % version)


def fmt_kb(n):
    return '%.0f KB' % (n / 1024.0)


if __name__ == '__main__':
    main()
