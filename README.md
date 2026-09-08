# GRAND PIXEL GAME

Jogo **3D voxel pixelado** em mundo aberto, com fonte bitmap 8-bit, cutscene de
abertura, menu principal completo e **34 missões** (3 da história + 31
secundárias). Mundo ~4x maior que a versão anterior: vila, campo radiante,
clareira, templo antigo, floresta dos sussurros, penhascos da mina, praia das
conchas e santuário do cume. WebGL puro + Canvas 2D — sem dependências, sem
build, sem rede.

## Como rodar

Sirva a pasta por um servidor estático (ES modules exigem http, não `file://`):

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080/`.

## Controles

| Ação              | Teclado                    | Toque               |
|-------------------|----------------------------|---------------------|
| Mover             | WASD / setas               | joystick virtual    |
| Falar / agir      | E                          | botão ✋            |
| Atacar            | F / J                      | botão ⚔ / tocar     |
| Pular / nadar     | Espaço                     | botão ▲             |
| Lista de missões  | Q (com mapa do vale)       | —                   |
| Som               | M                          | —                   |
| Pausa / menu      | Esc (menu com opções)      | botão ⏸             |
| Menu principal    | C = como jogar, O = opções | toque = jogar       |

Opções: volume da música, volume dos efeitos e distância de visão
(BAIXA/MÉDIA/ALTA). A configuração fica salva no navegador.

## Música da intro

- O jogo tem um **tema sintetizado original** que toca na abertura.
- Para tocar sua própria música na intro/cutscene, coloque o arquivo em
  `assets/music/` com um destes nomes: `inner-light.mp3`, `intro.mp3`,
  `grand-pixel-game.mp3`, `music.mp3` ou `ost.mp3` (também aceita `.ogg`,
  `.m4a` e `.wav`). O jogo detecta e toca na abertura.

> **Importante:** use somente arquivos que você tem o direito de usar e
> distribuir. Faixas comerciais (inclusive remixes não licenciados) continuam
> protegidas por direitos autorais — não é possível embutir esse tipo de
> material legalmente neste repositório; o mecanismo acima deixa você usar um
> arquivo seu localmente sem que ele seja distribuído pelo projeto.

## Como rodar

Sem servidor, o navegador bloqueia os módulos ES — use um destes jeitos:

**Windows (recomendado):** baixe o executável na página
[*Releases*](https://github.com/Arthurowgg/htmlgame/releases) deste repositório
(`GrandPixelGame-1.0.0-win64.exe`) — é autossuficiente: sobe o servidor local,
abre o navegador e fecha tudo numa janela só. Há também um ZIP portátil com o
mesmo jogo (Node + `gpg.cjs` + `Iniciar-GrandPixelGame.bat`).

**Python (qualquer sistema):** `python3 jogar.py` — serve o jogo e abre o
navegador (porta 8137; `--port 9000` muda; `--noopen` só imprime a URL).

**Node.js (qualquer sistema):**
`node desktop/build.js && node desktop/gpg-bundle.cjs`
(ou, para desenvolver, qualquer servidor estático: `python3 -m http.server 8137`)

Linux/macOS sem Node nem Python: habilite `--enable-local-file-accesses` no
Chrome abrindo `index.html` direto (não recomendado).

## Progresso

- Salvamento automático em `localStorage` (chave `grandpixel-save`).
- Para zerar tudo: menu de pausa → "Zerar progresso" (ou Ctrl+R na pausa).
- A cada 5 missões secundárias concluídas você ganha **+1 coração máximo**.

## O mundo

8 regiões ligadas por estradas (há placas na vila indicando cada saída):

- **Vila Solaria** (centro) — poço, obelisco, moinho, pousada e 3 NPCs.
- **Campo Radiante** (leste) — cristais da memória e slimes verdes.
- **Clareira das Lágrimas** (sudoeste) — flores de luz.
- **Templo Antigo** (noroeste) — slimes + baú da relíquia (missão da história).
- **Floresta dos Sussurros** (norte) — bagas, essências e wisps.
- **Penhascos da Mina** (oeste) — minérios e slimes de pedra.
- **Praia das Conchas** (sul) — conchas, píer e lagoa.
- **Santuário do Cume** (leste, montanha) — visão panorâmica.

## Estrutura

- `index.html` / `css/style.css` — página 16:9 responsiva + controles touch
- `js/math.js` — aleatório, ruído e matemática
- `js/font.js` — fonte bitmap 8×8 (pt-BR) desenhada em código
- `js/audio.js` — tema sintetizado + SFX 8-bit + música externa opcional
- `js/world.js` — mundo voxel 192×192 determinístico, biomas e regiões
- `js/renderer.js` — WebGL: terreno, água animada, sprites, brilhos, céu
- `js/quests.js` — NPCs, diálogos e as 34 missões (pt-BR)
- `js/main.js` — jogo: menus, cutscene, física, HUD, missões e save
