# Launcher — Grand Pixel Game (C++ / Windows)

Aplicativo Windows em C++ (Win32 puro) que lista, baixa e executa as
versões do jogo publicadas no GitHub. O jogo **nunca** vai embutido no
.exe — ele é conteúdo separado (`game-vX.Y.Z`, zip web).

## Código

- `main_a.cpp` — núcleo sem UI: WinHTTP (API do GitHub, download),
  JSON simples, zip de gravação sem compressão, servidor HTTP local
  (porta 8137), thread de rede com janela-mensagem, instância única.
  Define `GPG_LAUNCHER_VER` (versão do launcher).
- `main_b.cpp` — janela e UI do launcher + ponte de execução do jogo:
  abre o conteúdo no modo app do navegador Edge, cria a pasta
  `%LOCALAPPDATA%\GrandPixelGame\versions\<tag>\web` etc.
- `build.py` — concatena os dois .cpp numa unidade, gera ícone,
  manifesto, VERSIONINFO e cruza o .exe com Zig (`x86_64-windows-gnu`,
  `-municode`, subsistema windows).

## Compilar

```bash
pip install --user --break-system-packages ziglang
python3 launcher/build.py --version 1.0.0
# -> dist/launcher/GrandPixelGameLauncher-v1.0.0-win64.exe
```

Release do launcher: tag `launcher-vX.Y.Z`, exe em `dist/launcher/`.
Release do jogo (conteúdo): tag `game-vX.Y.Z`, zip em `dist/game/`.
