# Changelog — Grand Pixel Game

Versionamento semântico. Cada pedido vira um release com tag no GitHub.
Todo release publica o executável Windows (GrandPixelGame-vX.Y.Z-win64.exe)
na árvore da tag (pasta `dist/`) e, quando a rede permitir, como asset do
release no GitHub.

## [1.1.0] — 2026-09-09

Launcher Windows do Grand Pixel Game.

### Adicionado
- **Launcher nativo Windows** (`desktop/win/`): um único `.exe` (~450 KB)
  com o jogo completo embutido.
  - Janela bonita (Win32/GDI, sem dependências): painel com a versão
    selecionada, lista de versões publicadas no GitHub e status.
  - Instala e joga: extrai os arquivos e abre o jogo no navegador com
    servidor local embutido.
  - **Atualização automática**: ao abrir, verifica as versões do GitHub e
    baixa/instala a mais recente (pode ser desligada).
  - **Escolher qualquer versão**: cada release publicado tem um `.exe`;
    a lista mostra as versões do GitHub e o download roda em segundo plano
    com barra de progresso.
  - Janela do jogador discreta ("Jogando vX · servidor local ativo") com
    botões Abrir jogo / Encerrar.
- Pipeline de build 100% local: `desktop/win/build_win.py` (ícone,
  manifesto, recursos e exe gerados com Zig cross — sem instalação pesada).
- `dist/GrandPixelGame-v1.1.0-win64.exe` + zip web nesta release.

## [1.0.0] — 2026-09-08

Nome oficial do jogo: **Grand Pixel Game** (a vila de Solaria segue como
cenário da história). Primeiro release sob a política de "um release por
pedido".

### Adicionado
- Política de versões: releases por pedido, semver controlado no repositório.
- Versão exibida no menu do jogo (v1.0.0).

### Alterado
- Rebranding do título/UI/README/módulos de volta para *Grand Pixel Game*.
- Saves consolidados na chave canônica `grandpixel-save` (v4); saves da era
  "Solaria" (`solaria-save`) migram automaticamente.
- Configurações consolidadas em `grandpixel-cfg`.

### Base (trago deste release, do overhaul anterior)
- 70 missões: 11 capítulos da história + 59 secundárias, com cadeias de
  desbloqueio e motivo de bloqueio no diário.
- 10 artefatos míticos com efeito real no jogo.
- 3 chefes: Golem do Vale, Matriarca dos Sussurros, Guardião Sombrio.
- Duas regiões novas: Ilha do Recife e Cripta Esquecida (chefe final).
- UI moderna em DOM/CSS sobre o mundo 3D (menus, diário, opções, diálogos).
- Renderer suavizado (antialias + mipmap), ciclo dia/noite, tint de ambiente.
- Efeitos sonoros sintetizados; música externa removida.
