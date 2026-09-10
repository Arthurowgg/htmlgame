# Grand Pixel Game — o jogo

Mundo aberto em voxels, 3D, sem dependências: WebGL puro, ES modules e áudio
gerado em tempo real. Roda em qualquer navegador moderno.

## Rodar aqui

```bash
python3 -m http.server 8137        # nesta pasta
# abra http://localhost:8137
```

Ou, no Windows, use o **launcher** (release `launcher-v*` do repositório):
ele baixa esta pasta como pacote (`dist/*-web.zip`) e abre numa janela própria.

## Conteúdo da v1.2.0

- **Mapa da ilha (M)** com terreno de verdade, estradas, ícones de pixel por
  tipo de ponto, destino marcado, legenda e lista de lugares com distância.
- **Minimapa** com cone de visão, bússola, ícones, objetivo e zoom (`[` `]`).
- **Pixel art nativa**: tela de ~360 linhas ampliada em múltiplos inteiros,
  HUD em pixel art sem brilho, **fonte própria** (5x8 com acentos) no canvas e
  no HTML. Opção Pixels: Grossos/Médios/Finos.
- **A ilha habitada**: casas, torres, acampamentos, fazenda, arcos, mercados,
  placas, mastros e pontes sobre a água.
- **Abertura à prova de falhas**: se algo der errado, o jogo explica e oferece
  tentar de novo ou modo compatibilidade — nunca fica girando para sempre.
- **Registro de Jornada** (pausa) com tempo, coletas, chefes e 9 conquistas
  (saves v5; saves v4 antigos continuam funcionando).
- 70 missões (11 capítulos + 59 secundárias), 10 artefatos, 3 chefes, 10 regiões.

## Como a arte funciona

- `js/fontdata.js` — desenho da fonte de pixel (5x8) usado por `js/font.js` no
  canvas e por `assets/fonts/grandpixel.ttf` no HTML:
  `node tools/font_dump.mjs && python3 tools/build_font.py`
- `js/icons.js` — ícones de pixel 9x9 (casas, torres, portos, cavernas…)
- `js/pixel.js` — a grade de pixels da tela (`--px` no CSS)
- `js/minimap.js` — minimapa, mapa grande e o bitmap da ilha
- `node tools/preview.mjs` — gera PNGs de conferência em `gen/` (fonte,
  ícones, mapa) sem abrir navegador

## Testes

```bash
npm install --no-save jsdom
npm test            # abre o jogo num DOM real e verifica os 22 pontos
```

## Empacotar uma versão nova

1. Ajuste `VERSION` em `js/main.js` e o teste (`tests/smoke.mjs`).
2. `npm test`
3. `python3 tools/pack.py` → gera `dist/GrandPixelGame-vX.Y.Z-web.zip`
4. Commit, tag `game-vX.Y.Z` e release com o zip.

O zip usa compressão **STORE** (sem compactar) e tem o `index.html` na raiz:
é o contrato que o launcher espera para instalar direto.
