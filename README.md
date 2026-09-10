# Grand Pixel Game

Mundo aberto em voxels, no navegador — e um **launcher desktop para Windows**
que baixa e abre cada versão do jogo direto das publicações do GitHub.

```
game/       o jogo (HTML/CSS/JS — WebGL puro, sem dependências)
launcher/   o launcher Windows, em C++ (Win32), com build e testes
```

## Jogar no Windows (do jeito recomendado)

1. Baixe o launcher na aba **Releases**: release **`launcher-v1.1.0`**
   → `launcher/dist/GrandPixelGameLauncher-v1.1.0-win64.exe` (~1,7 MB)
2. Abra o `.exe`. Ele lista as versões publicadas, baixa a que você escolher
   (ou a mais nova) e abre o jogo numa janela própria.

> SmartScreen/antivírus podem pedir confirmação ("Executar assim mesmo") porque
> o arquivo não tem assinatura comercial. O código é aberto e o build é
> reproduzível: `python3 launcher/build.py`.

## Jogar sem instalar nada

```bash
cd game && python3 -m http.server 8137     # abra http://localhost:8137
```

## Como as versões funcionam

Duas linhas de release independentes:

| Linha | Tag | O que publica |
|---|---|---|
| Jogo (conteúdo) | `game-vX.Y.Z` | `game/dist/GrandPixelGame-vX.Y.Z-web.zip` |
| Launcher (app) | `launcher-vX.Y.Z` | `launcher/dist/GrandPixelGameLauncher-vX.Y.Z-win64.exe` |

- O jogo **nunca** é distribuído como `.exe`: é conteúdo (zip) que o launcher baixa.
- O launcher lê a API pública do GitHub, então **launchers antigos continuam
  jogando versões novas** — o formato das releases é um contrato estável.
- Cada pedido novo do projeto costuma sair como uma release do jogo
  (`game-v1.1.0`, `game-v1.2.0`, …); melhorias no app saem como `launcher-v*`.
- O conteúdo instalado fica em `%LOCALAPPDATA%\GrandPixelGame\versions\<tag>\web`,
  os registros em `launcher.log` na mesma pasta, e os saves no navegador do jogo.

## Desenvolvimento

```bash
# jogo
cd game && npm install --no-save jsdom && npm test
python3 game/tools/pack.py            # gera o zip da versão atual

# launcher (núcleo com testes nativos + build do .exe)
cd launcher && g++ -std=c++17 -O1 -Isrc/core src/core/*.cpp tests/test_core.cpp -o /tmp/t && /tmp/t
python3 launcher/build.py             # precisa do pacote Python `ziglang`
```

Veja `game/README.md`, `launcher/README.md` e `CHANGELOG.md`.
