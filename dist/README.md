# Binários das releases — Grand Pixel Game

Cada versão publicada tem seu executável aqui (na árvore da própria tag):

| Arquivo | Descrição |
|---|---|
| `GrandPixelGame-v1.2.0-win64.exe` | **Launcher + jogo completo para Windows** (~450 KB, sem instalação). Atualiza sozinho e baixa qualquer versão. Link direto: `https://github.com/Arthurowgg/htmlgame/raw/refs/tags/v1.2.0/dist/GrandPixelGame-v1.2.0-win64.exe` |
| `GrandPixelGame-v1.2.0-web.zip` | Versão web (index.html, js, css, assets) — só servir num servidor estático |

Abrir no GitHub: [releases](https://github.com/Arthurowgg/htmlgame/releases) → escolher a versão → os links de download estão no topo da descrição.

- **Gerar** (Windows ou Linux, sem toolchain): `python3 desktop/win/build_win.py`
- **Anexar como asset formal da release** (quando o ambiente tiver acesso a uploads.github.com): `python3 desktop/win/publish.py v1.2.0`
