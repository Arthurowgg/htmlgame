# Grand Pixel Game

Jogo 3D voxel em mundo aberto, direto no navegador — WebGL puro + Canvas 2D,
sem dependências, sem build, sem rede. **70 missões** (11 capítulos da
história + 59 secundárias), **10 artefatos míticos** e chefes de verdade
(Golem do Vale, Matriarca dos Sussurros e o Guardião Sombrio da Cripta
Esquecida).

## O mundo

Oito regiões clássicas — vila de Solaria, Campo Radiante, Clareira das
Lágrimas, Templo Antigo, Floresta dos Sussurros, Penhascos da Mina, Praia das
Conchas e Santuário do Cume — mais duas: a **Ilha do Recife** (nordeste, do
outro lado do mar) e a **Cripta Esquecida** (meseta no sudoeste, casa do
chefe final). O dia e a noite passam com estrelas, sol e lua; a Cripta tem
atmosfera própria.

## Como rodar

Sirva a pasta por um servidor estático (ES modules exigem http, não `file://`):

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080/` — ou use `python3 jogar.py` (abre o navegador
sozinho na porta 8137).

## Controles

| Ação             | Teclado               | Toque               |
|------------------|-----------------------|---------------------|
| Mover            | WASD / setas          | joystick virtual    |
| Falar / agir     | E                     | botão E             |
| Atacar           | F / J / clique        | botão ⚔             |
| Pular / nadar    | Espaço (2× com as Botas Aladas) | botão ▲   |
| Diário           | Q (história, missões, artefatos e mapa) | botão ✦ |
| Som liga/desliga | M                     | opções              |
| Pausa / menu     | Esc                   | botão ⏸             |

Opções: volume dos efeitos, som liga/desliga e distância de visão
(BAIXA/MÉDIA/ALTA). Tudo fica salvo no navegador.

## Progresso

- Saves em `localStorage` (chave `grandpixel-save`, v4). Saves antigos da
  era "Solaria" (`solaria-save`) e do formato v3 são migrados
  automaticamente na primeira execução.
- Artefatos: Coroa de Solaria, Botas Aladas, Anel Vital, Amuleto de Fúria,
  Capa do Vento, Lâmina do Alvorecer, Olho do Cartógrafo, Semente Estelar,
  Coração da Ilha e Lente da Verdade — cada um muda como você joga.

## Versão Windows (.exe)

Cada release do Grand Pixel Game publica o **executável Windows**:

- `GrandPixelGame-v1.1.0-win64.exe` — launcher + jogo completo num único
  arquivo (~450 KB, sem instalação, sem Node): abre numa janela bonita com
  a versão selecionada, lista as versões publicadas no GitHub, baixa a que
  você escolher (ou atualiza sozinho para a mais recente) e abre o jogo no
  navegador com servidor local embutido.
- O download direto do .exe de cada versão fica em
  `dist/GrandPixelGame-vX.Y.Z-win64.exe` na árvore da tag, também publicado
  como asset do release quando o ambiente de publicação tem acesso ao GitHub
  (uploads.github.com). Em qualquer caso o link da tag funciona:
  `https://github.com/Arthurowgg/htmlgame/raw/refs/tags/vX.Y.Z/dist/GrandPixelGame-vX.Y.Z-win64.exe`.

Para gerar o .exe localmente: `python3 desktop/win/build_win.py`
(requer o pacote Python `ziglang` — `pip install --user --break-system-packages ziglang`).
Para publicar os assets num release: `python3 desktop/win/publish.py vX.Y.Z`.

## Versões e releases

Versionamento semântico, controlado aqui mesmo: **cada pedido novo gera um
release** no GitHub com tag (`vMAIOR.menor.patch`) e entrada no
[CHANGELOG.md](CHANGELOG.md). Regra simples:

- pedido novo / nova funcionalidade → bump de **menor** (ex.: v1.0.0 → v1.1.0);
- correção de bug sem funcionalidade nova → bump de **patch**;
- mudança que quebra saves ou a estrutura do jogo → bump de **maior**.

A versão atual aparece no menu do jogo.

## Estrutura

```
index.html        interface e telas (DOM/CSS por cima do mundo 3D)
css/style.css     visual da UI
js/main.js        jogo: mundo aberto, missões, chefes, HUD, saves
js/world.js       gerador do mundo (terreno, biomas, POIs, sprites)
js/quests.js      dados das 70 missões e dos artefatos + desbloqueios
js/renderer.js    renderizador WebGL (terreno voxel, sprites, brilhos)
js/audio.js       efeitos sonoros sintetizados (WebAudio, sem arquivos)
js/math.js        matemática 3D e ruído
js/font.js        fonte bitmap auxiliar
desktop/win/      launcher Windows + build (C/Zig, sem dependências)
dist/             executáveis e zips publicados em cada release
jogar.py          servidor local de um clique
CHANGELOG.md      histórico de versões
.smoke/           testes headless (fora do controle de versão)
```

O mundo é gerado deterministicamente por seed (20260908) — mesmo mapa para
todo mundo, sempre.
