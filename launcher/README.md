# Launcher — Grand Pixel Game (Windows, C++)

Aplicativo Windows em C++ que lista, baixa e executa as versões do jogo
publicadas no GitHub. **O jogo nunca vai dentro do `.exe`.**

## Como está organizado

```
src/core/     núcleo portátil, sem Windows: strings, versões, JSON, SHA-256,
              ZIP (STORE), catálogo das releases, estado local e o motor
              (buscar → baixar → instalar → jogar), com eventos para a UI
src/ui/       a interface inteira: telas, widgets, ícones vetoriais, animações
              e o leiaute — desenha por cima de uma camada de primitivas
src/plat/win/ a parte de Windows: janela e laço de mensagens, desenho com GDI
              (transparência real), WinHTTP, arquivos, servidor local do jogo,
              janela do jogo (modo app do Edge) e a auto-atualização
assets/       arte do app (PNG, embutida comprimida no executável)
tools/        geração do ícone e da arte embutida
tests/        verificações do núcleo, rodando nativo (g++), sem Windows
```

O núcleo não conhece o Windows: ele conversa com o sistema por três interfaces
(`FS`, `Net`, `Platform`). É por isso que dá para testar de verdade numa máquina
Linux, e é o mesmo código que roda no `.exe`.

## Compilar

```bash
pip install --user --break-system-packages ziglang pillow
python3 launcher/build.py                 # -> launcher/dist/GrandPixelGameLauncher-vX.Y.Z-win64.exe
python3 launcher/build.py --debug         # sem otimizar, para investigar
```

Versão do launcher: `src/version.txt`. O executável sai com ícone próprio,
manifesto (DPI por monitor, UTF-8), ficha de versão no Windows e só depende de
DLLs que já existem no Windows 10/11.

## Conferir antes de publicar

```bash
cd launcher
g++ -std=c++17 -O1 -Isrc/core src/core/*.cpp tests/test_core.cpp -o /tmp/t && /tmp/t
GPG_REAL_ZIP=../game/dist/GrandPixelGame-v1.1.0-web.zip /tmp/t   # testa o pacote real
```

## Publicar

1. Ajuste `src/version.txt`, rode o build e os testes.
2. Commite o `.exe` em `launcher/dist/`.
3. Tag `launcher-vX.Y.Z` + release com as notas.

## Contrato com o jogo

- Catálogo: `https://api.github.com/repos/Arthurowgg/htmlgame/releases?per_page=100`
- Jogo: tags `game-vX.Y.Z` → `.../raw/refs/tags/game-vX.Y.Z/game/dist/GrandPixelGame-vX.Y.Z-web.zip`
  (zip **STORE**, `index.html` na raiz)
- Launcher: tags `launcher-vX.Y.Z` → `.../launcher/dist/GrandPixelGameLauncher-vX.Y.Z-win64.exe`
- Instalação: `%LOCALAPPDATA%\GrandPixelGame\versions\<tag>\web`, servido em
  `127.0.0.1:8137` (porta fixa = saves no mesmo lugar), aberto no modo app do Edge.
