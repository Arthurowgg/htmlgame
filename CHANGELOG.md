# Changelog — Grand Pixel Game

Duas linhas de versão independentes, cada uma com **release própria no GitHub**:

| Linha | Tag | O que contém |
|---|---|---|
| **Launcher** | `launcher-vX.Y.Z` | O aplicativo Windows (`.exe`) que baixa e joga. |
| **Jogo** | `game-vX.Y.Z` | Só o conteúdo do jogo (`-web.zip`, **nunca** um .exe). |

- O launcher consulta o GitHub, lista as releases `game-v*` e baixa a
  versão escolhida (ou a mais nova, com a atualização automática ligada).
  O mesmo launcher antigo continua funcionando com versões futuras do
  jogo: o formato das releases é fixo e estável.
- Atualização do **launcher** é avisada dentro do app (chip dourado com
  link para a release `launcher-v*`); o jogo nunca precisa de outro
  programa.
- Cada pedido novo gera uma release do jogo (bump de menor/patch).
  Mudanças no launcher geram release do launcher, à parte.

## [Launcher 1.0.0] — 2026-09-09

Launcher reescrito do zero em **C++ (Win32)**, empacotado num .exe único.

- Sem jogo embutido: o .exe só conversa com o GitHub e roda o conteúdo
  baixado — separação total entre launcher e jogo.
- Janela com barra de título nativa do Windows (app normal), identidade
  completa no executável (empresa, versão, descrição, ícone) e log de
  diagnóstico em `%LOCALAPPDATA%\GrandPixelGame\launcher.log`.
- Visual customizado: tema escuro com dourado, estrelas, cards, badges
  INSTALADA/NOVA, barra de progresso do download, spinner.
- Abre o jogo em janela própria (modo app do navegador Edge), com
  instância única por versão e retomada da porta 8137.
- Conteúdo instalado em `%LOCALAPPDATA%\GrandPixelGame\versions\<tag>\web`.

## [Jogo 1.0.0] — 2026-09-09

Reinício da numeração do jogo (histórico anterior foi arquivado junto
com as releases antigas). Conteúdo atual: 70 missões (11 capítulos +
59 secundárias), 10 artefatos, 3 chefes, 10 regiões, dia/noite,
saves v4 com migração automática.
