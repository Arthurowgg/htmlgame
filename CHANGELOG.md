# Changelog — Grand Pixel Game

Duas linhas de versão independentes, cada uma com release própria no GitHub:

| Linha | Tag | O que contém |
|---|---|---|
| **Launcher** | `launcher-vX.Y.Z` | O aplicativo Windows (`.exe`). |
| **Jogo** | `game-vX.Y.Z` | Só o conteúdo (`-web.zip`). **Nunca um .exe.** |

O launcher lê a API do GitHub, lista as releases `game-v*`, baixa e instala a
versão escolhida e abre o jogo numa janela própria. Launchers antigos continuam
funcionando com jogos novos: o formato das releases é estável.

---

## [Launcher 1.1.2] — 2026-09-10

- O launcher agora **prefere o arquivo anexado na release (Assets)** para se
  atualizar e para baixar o jogo; sem arquivo anexado, usa o link versionado na
  árvore da tag — as duas formas funcionam e dá para publicar das duas maneiras.
- Automação pronta em `.github/release-assets.workflow.yml`: ativando-a, toda
  tag publicada ganha o executável/pacote anexado automaticamente (e a primeira
  execução preenche as releases antigas).

## [Jogo 1.2.0] — 2026-09-10

**A ilha ficou de verdade, e a tela nunca mais trava.**

- **Nunca mais preso em "acendendo o mundo"**: a carga tem barra e etapas, e
  qualquer erro (WebGL bloqueado, driver antigo, script) aparece numa tela que
  explica o motivo e oferece *tentar de novo*, *modo compatibilidade* e
  *copiar detalhes*. Sem WebGL o jogo avisa em vez de girar para sempre.
- **Pixel art de verdade**: a tela do jogo tem ~360 linhas e é ampliada em
  múltiplos inteiros, sem suavização — todo pixel é quadrado e do mesmo
  tamanho. Opção Grossos/Médios/Finos e os atalhos `?pixel=N` e `?compat=1`.
- **Fonte de pixel própria** (5x8, com minúsculas e acentos), desenhada no
  repositório e usada no canvas e no HTML (TTF gerado por
  `tools/build_font.py`). Nada de fonte do sistema, nada de emoji/brilho.
- **Mapa da ilha (M)**: terreno real com relevo, estradas, mancha de cor por
  região, ícones de pixel por tipo de ponto, destino marcado, legenda e uma
  lista lateral navegável que dá a distância de cada lugar.
- **Minimapa de jogo**: cone de visão, bússola, ícones, marcador de objetivo
  (seta na borda quando o alvo está fora), zoom com `[` e `]`.
- **A ilha ganhou vida**: casas com telhado e chaminé, torres de vigia,
  acampamentos com fogueira, fazenda com canteiros e espantalho, arcos de
  ruína, mercados, placas, mastros e **pontes** onde as estradas cruzam água.
- Marcação de destino: clique em qualquer ponto do mapa grande e ele vira
  destino (aparece no minimapa a caminho).
- 52 verificações automáticas (incluindo o caso sem WebGL).

## [Launcher 1.1.1] — 2026-09-10

- O servidor local do launcher passou a entregar fontes (`.ttf`, `.otf`,
  `.woff`) — o jogo agora embute a fonte de pixel própria.

## [Launcher 1.1.0] — 2026-09-10

Reescrita completa do launcher: agora é um aplicativo de verdade, feito em
**C++ (Win32)**, num único `.exe` de ~1,7 MB — sem runtime para instalar.

- **Biblioteca de versões**: cards com capa, data, tamanho, selos NOVA /
  INSTALADA e progresso de download ao vivo (velocidade, tempo restante e
  botão de cancelar).
- **Busca e filtros** (todas / instaladas / disponíveis) e painel de detalhes
  com as notas de cada versão.
- **Painel de início** com arte, o botão JOGAR que decide sozinho o que baixar,
  novidades da última versão e "continuar jogando".
- **Ajustes**: atualização automática, fechar o launcher ao jogar, pasta de
  instalação (com seletor), verificação manual e registro de diagnóstico.
- **Auto-atualização do launcher**: baixa a versão `launcher-v*` mais nova e
  troca o executável por um processo auxiliar, reiniciando sozinho.
- **Bandeja**: ao jogar, o launcher vai para a bandeja e continua servindo o
  jogo em `127.0.0.1:8137` (é o que mantém saves e progresso no mesmo lugar).
- Download com **retomada** (Range), 3 estados de erro claros, cache do
  catálogo para abrir offline e log em `%LOCALAPPDATA%\GrandPixelGame\launcher.log`.
- Núcleo separado da interface e testado nativamente: **80 verificações**
  (`launcher/tests/test_core.cpp`), incluindo a extração de um pacote real.

## [Jogo 1.1.0] — 2026-09-10

- **Registro de Jornada** (menu de pausa → Registro de Jornada): tempo de
  jornada, itens coletados, criaturas derrotadas, chefes, artefatos, pontos
  descobertos e barras de progresso de história, secundárias e artefatos.
- **9 conquistas** — de "Primeiros Passos" a "Coração de Solaria" — que
  aparecem no jogo assim que são ganhas e ficam guardadas no save.
- Saves **v5** (tempo de jogo, mortes e conquistas). Saves v4 anteriores
  continuam abrindo normalmente.
- 70 missões (11 capítulos + 59 secundárias), 10 artefatos, 3 chefes, 10 regiões.

## [Launcher 1.0.0 / Jogo 1.0.0] — 2026-09-09

Marco zero do esquema separado (substituiu o pacote único anterior).
