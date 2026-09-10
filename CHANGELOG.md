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
