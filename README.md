# Grand Pixel Game

Jogo 3D voxel em mundo aberto, direto no navegador (WebGL, sem dependências).
70 missões, 10 artefatos e 3 chefes em 10 regiões.

## Como jogar no PC (Windows)

Baixe o **launcher** na aba Releases (release `launcher-v1.0.0`):
[GrandPixelGameLauncher-v1.0.0-win64.exe](https://github.com/Arthurowgg/htmlgame/raw/refs/tags/launcher-v1.0.0/dist/launcher/GrandPixelGameLauncher-v1.0.0-win64.exe)

- O launcher lista as versões do jogo publicadas no GitHub, baixa a que
  você escolher (ou a mais nova, com atualização automática) e abre o
  jogo numa janela própria — sem instalar nada, sem baixar programas.
- O jogo **não tem .exe**: cada versão do jogo é uma release `game-v*`
  com apenas o conteúdo (`web.zip`).
- SmartScreen/antivírus podem pedir "Executar assim mesmo" (arquivo sem
  assinatura paga) — o código é aberto e o build é reproduzível
  (`python3 launcher/build.py`).

## Releases (a partir de agora)

Duas linhas separadas — `launcher-v*` (o app Windows) e `game-v*`
(só conteúdo). Launchers antigos funcionam com jogos futuros; formato
estável. Cada pedido novo = uma release do jogo.

## Na web (qualquer sistema)

```bash
python3 -m http.server 8080     # na pasta do projeto
# abra http://localhost:8080
```

## Controles

WASD/setas mover · E falar/agir · F atacar · Espaço pular · Q diário ·
Esc pausa. Toque: joystick + botões. Opções de som e distância de visão.

## Estrutura

```
launcher/        app Windows (C++/Win32) + build do .exe
js/ css/ index.html   o jogo (web)
dist/game/       conteúdo de cada versão do jogo (zip, nas tags)
dist/launcher/   executáveis do launcher (nas tags launcher-v*)
.smoke/          testes headless
```
