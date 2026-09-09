# Changelog — Grand Pixel Game

Versionamento semântico. Cada pedido vira um release com tag no GitHub.
Todo release publica o executável Windows (GrandPixelGame-vX.Y.Z-win64.exe)
na árvore da tag (pasta `dist/`) e, quando a rede permitir, como asset do
release no GitHub.

## [1.3.1] — 2026-09-09

Diagnóstico de "exe não abre".

### Adicionado
- Log de diagnóstico gravado desde o primeiro passo do processo em
  `%LOCALAPPDATA%\GrandPixelGame\launcher.log` (modo, caminho do .exe,
  criação de janelas, erros com código) — essencial para caçar falha
  silenciosa.
- Janela do launcher/jogador trazida para o primeiro plano com flash ao
  abrir; posição com fallback quando a área de trabalho é inválida.
- Mensagens de erro citam o arquivo de log.

## [1.3.0] — 2026-09-09

Launcher como aplicativo de verdade + conteúdo por versão.

### Alterado
- **Janela própria (modo app)**: JOGAR abre o jogo numa janela de aplicativo
  (Edge `--app`, 1280x800) em vez de aba solta do navegador; sem Edge, usa
  o navegador padrão.
- **Download de conteúdo, não de executável**: o launcher baixa apenas o
  `web.zip` (~65-210 KB) de cada versão, instala em
  `%LOCALAPPDATA%\GrandPixelGame\versions\<tag>\web` (descompactador
  STORE próprio, testado) e roda aquela versão servindo do disco. Nenhum
  código baixado é executado.
- **Instância única por versão**: abrir duas vezes o mesmo jogo só traz a
  janela de volta; abrir uma versão diferente toma a porta da anterior
  educadamente (endpoint de encerramento).
- Erros de janela agora mostram diálogo com o código do erro (GetLastError)
  e instruções, em vez de falhar em silêncio.
- Rebranding: título do jogo/aba/loading/diário sem "Solaria" —
  o nome é **Grand Pixel Game** (Solaria permanece só como vila na
  história); versão do jogo -> 1.3.0.
- Zip web publicado como STORE (compatível com o instalador do launcher).

## [1.2.0] — 2026-09-09

Launcher reformulado (visual novo) e correções de robustez do .exe.

### Corrigido
- Possíveis causas de o .exe "não abrir": nomes de classe de janela agora
  são estáticos (o Windows guarda o ponteiro, não cópia — antes a janela do
  modo jogador podia falhar silenciosamente), e qualquer falha de criação
  de janela mostra um diálogo de erro com o código em vez de sair mudo.
- Download/estrutura do executável revisados e validados (PE, recursos,
  imports) — o .exe é um PE normal de ~460 KB, sem compactação.

### Alterado
- Launcher muito mais bonito: fundo com estrelas e gradiente, double-buffer
  (sem flicker), card de versão selecionada com badges e botão JOGAR em
  ouro com brilho, lista com rádios/badges/legenda, spinner animado,
  barra de progresso com %, checkbox de auto-update com tooltip, janela do
  jogador redesenhada com selo, endereço do servidor e botões grandes.

## [1.1.1] — 2026-09-09

Disponibilização do download do launcher (assets).

### Corrigido
- A aba Assets das releases mostrava só os arquivos de código-fonte
  automáticos: o host de upload do GitHub (uploads.github.com) está
  bloqueado na rede do ambiente de publicação, então nenhum asset formal
  podia ser anexado por aqui.
- Cada release agora traz o download **no topo da descrição**, com link
  direto para o .exe versionado na árvore da própria tag
  (`dist/GrandPixelGame-vX.Y.Z-win64.exe`), que funciona para qualquer
  pessoa; `desktop/win/publish.py` anexa os binários como assets formais
  quando a rede permitir.
- Adicionado `dist/README.md` explicando os binários de cada release.

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
