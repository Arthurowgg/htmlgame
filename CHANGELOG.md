# Changelog — Grand Pixel Game

Versionamento semântico. Cada pedido vira um release com tag no GitHub.

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
